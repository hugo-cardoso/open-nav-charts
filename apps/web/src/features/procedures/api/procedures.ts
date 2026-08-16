import { requestJson } from "../../../shared/api/client.js";
import type { CollectionResponse, Procedure } from "../../../shared/api/types.js";
import { normalizeIcao } from "../../../shared/domain/icao.js";

export interface ProcedureRequestOptions {
  readonly baseUrl: string;
  readonly signal?: AbortSignal;
}

export async function listProcedures(
  icao: string,
  type: string | null | undefined,
  options: ProcedureRequestOptions,
): Promise<CollectionResponse<Procedure>> {
  const normalizedType = type?.trim().toUpperCase();

  return requestJson<CollectionResponse<Procedure>>({
    baseUrl: options.baseUrl,
    path: `/v1/airports/${encodeURIComponent(normalizeIcao(icao))}/procedures`,
    query: { type: normalizedType || null },
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/**
 * Monta a URL da carta. **Não faz requisição** — e isso é essencial.
 *
 * A rota responde `302` para uma URL assinada válida por 300 segundos. Buscá-la
 * por `fetch` exigiria CORS no repositório de objetos e faria o PDF atravessar a
 * aplicação. A URL é usada como destino de navegação, montada no instante do
 * acionamento e nunca armazenada, para que reabrir a carta muito depois continue
 * funcionando (FR-016, FR-017, research R6).
 */
export function buildChartUrl(baseUrl: string, icao: string, procedureId: string): string {
  const path = `/v1/airports/${encodeURIComponent(normalizeIcao(icao))}/procedures/${encodeURIComponent(procedureId)}/chart`;
  return `${baseUrl}${path}`;
}
