import { useQuery } from "@tanstack/react-query";
import { toFailure } from "../../../shared/api/client.js";
import type { CollectionResponse, Procedure } from "../../../shared/api/types.js";
import { environment } from "../../../shared/config/environment.js";
import { isValidIcao, normalizeIcao } from "../../../shared/domain/icao.js";
import type { ApiFailure } from "../../../shared/errors/error-messages.js";
import { listProcedures } from "../api/procedures.js";

/**
 * Cache sem expiração para os procedimentos de um aeródromo.
 *
 * O acervo é publicado em ciclos AIRAC de 28 dias, então os dados não mudam
 * durante uma sessão. Como as abas agrupam em memória e não por requisição, uma
 * única chamada por aeródromo serve a toda a navegação — trocar de aba ou voltar
 * ao aeródromo não gera tráfego novo.
 *
 * `gcTime: Infinity` é o que completa o efeito: sem ele, o React Query
 * descartaria a entrada após o tempo padrão de coleta assim que nenhum
 * componente a observasse, e voltar ao aeródromo refaria a requisição mesmo com
 * `staleTime` infinito.
 */
const PROCEDURES_CACHE = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;

export interface ProceduresResult {
  readonly data: CollectionResponse<Procedure> | undefined;
  readonly failure: ApiFailure | null;
  readonly isLoading: boolean;
  readonly refetch: () => void;
}

/**
 * Lista **todos** os procedimentos do aeródromo. O recorte por grupo acontece na
 * interface, então não há parâmetro de tipo aqui: buscar por tipo geraria uma
 * requisição por aba e desperdiçaria o cache.
 */
export function useProcedures(icao: string | undefined): ProceduresResult {
  const enabled = isValidIcao(icao);
  const normalized = enabled ? normalizeIcao(icao) : "";

  const result = useQuery({
    queryKey: ["procedures", normalized],
    queryFn: ({ signal }) =>
      listProcedures(normalized, null, { baseUrl: environment.apiBaseUrl, signal }),
    enabled,
    ...PROCEDURES_CACHE,
  });

  return {
    data: result.data,
    failure: result.error === null ? null : toFailure(result.error),
    isLoading: enabled && result.isPending,
    refetch: () => {
      // Nova tentativa após falha é explícita do usuário e ignora o cache.
      void result.refetch();
    },
  };
}
