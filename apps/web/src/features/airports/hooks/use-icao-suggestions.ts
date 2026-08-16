import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { toFailure } from "../../../shared/api/client.js";
import type { AirportSummary } from "../../../shared/api/types.js";
import { environment } from "../../../shared/config/environment.js";
import type { ApiFailure } from "../../../shared/errors/error-messages.js";
import { listAirports } from "../api/airports.js";

/**
 * Sugestões de aeródromo por código ICAO.
 *
 * Consulta o endpoint de listagem já existente — não há rota dedicada de
 * autocomplete na API, e criar uma entregaria os mesmos dados com menos campos.
 * O recorte "apenas ICAO" acontece aqui: a API casa código **e** nome no mesmo
 * parâmetro, então descartamos o que não casa pelo código.
 */

/** Atraso antes de consultar: sem ele cada tecla viraria uma requisição. */
export const SUGGESTION_DEBOUNCE_MS = 250;

/** Mínimo para consultar: com uma letra a lista seria longa demais para ajudar. */
export const MIN_SUGGESTION_LENGTH = 2;

/** Teto de sugestões exibidas; o suficiente para caber sem rolagem longa. */
export const MAX_SUGGESTIONS = 8;

export interface IcaoSuggestionsResult {
  readonly suggestions: readonly AirportSummary[];
  readonly failure: ApiFailure | null;
  readonly isLoading: boolean;
  readonly isEnabled: boolean;
  readonly refetch: () => void;
}

/** Só letras: o ICAO não tem dígitos nem separadores. */
export function sanitizeIcaoInput(value: string): string {
  return value
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 4);
}

/**
 * A API responde "contém" e sobre código ou nome; a interface promete "código
 * que começa com". Filtrar aqui é o que alinha o resultado à promessa — sem
 * isso, buscar "GR" traria todo aeródromo cujo nome contivesse "gr".
 */
export function matchesIcaoPrefix(airport: AirportSummary, prefix: string): boolean {
  return airport.icao.toUpperCase().startsWith(prefix.toUpperCase());
}

export interface IcaoSuggestionsQuery {
  readonly term: string;
  /** Código ISO alpha-2; quando presente, a API restringe a busca a ele. */
  readonly country: string | null;
}

export function useIcaoSuggestions(query: IcaoSuggestionsQuery): IcaoSuggestionsResult {
  const [debouncedTerm] = useDebouncedValue(query.term, SUGGESTION_DEBOUNCE_MS);

  const term = sanitizeIcaoInput(debouncedTerm);
  const isEnabled = term.length >= MIN_SUGGESTION_LENGTH;

  const result = useQuery({
    // A chave carrega os critérios: uma resposta de termo antigo pertence a
    // outra chave e nunca substitui a da chave ativa (FR-012).
    queryKey: ["airport-suggestions", term, query.country],
    queryFn: ({ signal }) =>
      listAirports(
        {
          search: term,
          country: query.country,
          // Margem sobre o teto: a API casa nome também, e parte do que volta é
          // descartado no filtro por prefixo.
          pageSize: MAX_SUGGESTIONS * 3,
        },
        { baseUrl: environment.apiBaseUrl, signal },
      ),
    enabled: isEnabled,
  });

  const suggestions = (result.data?.items ?? [])
    .filter((airport) => matchesIcaoPrefix(airport, term))
    .slice(0, MAX_SUGGESTIONS);

  return {
    suggestions,
    failure: result.error === null ? null : toFailure(result.error),
    isLoading: isEnabled && result.isFetching,
    isEnabled,
    refetch: () => {
      void result.refetch();
    },
  };
}
