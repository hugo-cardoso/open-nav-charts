import type {
  Airport,
  AirportProcedure,
  AirportRunway,
  AirportSummary,
} from "@open-nav-charts/domain";

/**
 * Modelos de resposta, separados das entidades de domínio. É essa separação que
 * garante FR-017: `storageKey`, `sourceUrl` e `archivedAt` não vazam porque não
 * existem nestes tipos.
 */

export interface RunwayResponse {
  readonly ident: string;
  readonly lengthMeters: number | null;
  readonly widthMeters: number | null;
}

export interface AirportSummaryResponse {
  readonly icao: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface AirportDetailResponse extends AirportSummaryResponse {
  readonly runways: readonly RunwayResponse[];
}

export interface ProcedureResponse {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly amendment: string | null;
  readonly hasChart: boolean;
}

export interface PageResponse<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasNext: boolean;
}

export interface CollectionResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Campos ausentes saem como `null` explícito, nunca omitidos: o consumidor
 * distingue "sem valor" de "campo que a API deixou de enviar".
 */
export function toAirportSummaryResponse(airport: AirportSummary): AirportSummaryResponse {
  return {
    icao: airport.icao,
    name: airport.name,
    city: airport.city,
    state: airport.state,
    latitude: airport.latitude,
    longitude: airport.longitude,
  };
}

export function toAirportDetailResponse(airport: Airport): AirportDetailResponse {
  return {
    ...toAirportSummaryResponse(airport),
    runways: airport.runways.map(toRunwayResponse),
  };
}

export function toRunwayResponse(runway: AirportRunway): RunwayResponse {
  return {
    ident: runway.ident,
    lengthMeters: runway.lengthMeters,
    widthMeters: runway.widthMeters,
  };
}

export function toProcedureResponse(procedure: AirportProcedure): ProcedureResponse {
  return {
    id: procedure.id,
    name: procedure.name,
    type: procedure.type,
    amendment: procedure.amendment,
    hasChart: hasChart(procedure),
  };
}

/**
 * Documento disponível é `storageKey` e `archivedAt` ambos preenchidos: a chave
 * sozinha não prova que o objeto chegou ao bucket (data-model §1).
 */
export function hasChart(procedure: AirportProcedure): boolean {
  return procedure.storageKey !== null && procedure.archivedAt !== null;
}

export function toPageResponse<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
  total: number,
): PageResponse<T> {
  return { items, page, pageSize, total, hasNext: page * pageSize < total };
}
