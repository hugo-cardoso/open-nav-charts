import type { Airport, AirportProcedure, AirportRunway } from "../entities/index.js";

/**
 * Conversões entre linha do banco e entidade. Funções puras sem I/O — a exceção
 * de "classe para tudo" prevista no plano para transformações sem colaboradores.
 */

export interface AirportRow {
  readonly icao: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
}

export interface RunwayRow {
  readonly ident: string;
  readonly lengthM: number | null;
  readonly widthM: number | null;
}

export interface ProcedureRow {
  readonly id: string;
  readonly airportIcao: string;
  readonly name: string;
  readonly type: string;
  readonly amendment: string | null;
  readonly sourceUrl: string | null;
  readonly storageKey: string | null;
  readonly archivedAt: Date | null;
}

/**
 * `numeric` volta do driver `pg` como string para não perder precisão. Aqui a
 * coordenada é convertida ao `number` da entidade.
 */
function toCoordinate(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toAirport(row: AirportRow, runways: readonly RunwayRow[]): Airport {
  return {
    icao: row.icao,
    name: row.name,
    city: row.city,
    state: row.state,
    latitude: toCoordinate(row.latitude),
    longitude: toCoordinate(row.longitude),
    runways: runways.map(toRunway),
  };
}

export function toRunway(row: RunwayRow): AirportRunway {
  return {
    ident: row.ident,
    lengthMeters: row.lengthM,
    widthMeters: row.widthM,
  };
}

export function toProcedure(row: ProcedureRow): AirportProcedure {
  return {
    id: row.id,
    airportIcao: row.airportIcao,
    name: row.name,
    type: row.type,
    amendment: row.amendment,
    sourceUrl: row.sourceUrl,
    storageKey: row.storageKey,
    archivedAt: row.archivedAt,
  };
}

/** `numeric` é gravado como string; `null` quando a coordenada não veio. */
export function fromCoordinate(value: number | null): string | null {
  return value === null ? null : value.toFixed(6);
}
