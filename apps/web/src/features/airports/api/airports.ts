import { requestJson } from "../../../shared/api/client.js";
import type { AirportDetail, AirportSummary, PageResponse } from "../../../shared/api/types.js";
import { normalizeIcao } from "../../../shared/domain/icao.js";

/** Padrão da API; declarado aqui para permitir a omissão do parâmetro. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

export interface AirportSearchQuery {
  readonly search?: string | null;
  readonly state?: string | null;
  readonly country?: string | null;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface AirportRequestOptions {
  readonly baseUrl: string;
  readonly signal?: AbortSignal;
}

function normalizeCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toUpperCase();
  return trimmed === undefined || trimmed === "" ? null : trimmed;
}

export async function listAirports(
  query: AirportSearchQuery,
  options: AirportRequestOptions,
): Promise<PageResponse<AirportSummary>> {
  const page = query.page ?? DEFAULT_PAGE;

  return requestJson<PageResponse<AirportSummary>>({
    baseUrl: options.baseUrl,
    path: "/v1/airports",
    query: {
      search: query.search?.trim() || null,
      state: normalizeCode(query.state),
      country: normalizeCode(query.country),
      // `buildUrl` omite valores nulos; a API aplica seus próprios padrões.
      page: page === DEFAULT_PAGE ? null : page,
      pageSize: query.pageSize ?? null,
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export async function getAirport(
  icao: string,
  options: AirportRequestOptions,
): Promise<AirportDetail> {
  return requestJson<AirportDetail>({
    baseUrl: options.baseUrl,
    path: `/v1/airports/${encodeURIComponent(normalizeIcao(icao))}`,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
