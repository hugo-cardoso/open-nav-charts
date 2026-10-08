import {
  type AirportCatalogEntry,
  BRAZIL_COUNTRY_CODE,
  type ChartSummary,
} from "@open-nav-charts/aisweb-client";
import type { Airport, AirportProcedure, AirportRunway } from "@open-nav-charts/domain";

/**
 * Montagem e igualdade entre o que a fonte publica e o que está persistido
 * (data-model, "Igualdade"). Funções puras: é delas que depende pular um
 * aeródromo, então uma falsa diferença regravaria a base inteira a cada execução
 * e uma falsa igualdade esconderia mudança da fonte.
 */

/** Casas decimais de `numeric(9,6)`, as mesmas que o mapeador grava. */
const COORDINATE_DECIMALS = 6;

export function toAirport(entry: AirportCatalogEntry, runways: readonly AirportRunway[]): Airport {
  // Meia coordenada é inútil: as duas são gravadas juntas ou nenhuma.
  const hasCoordinates = entry.latitude !== null && entry.longitude !== null;
  return {
    icao: entry.icao.toUpperCase(),
    name: entry.name,
    city: entry.city,
    state: entry.state,
    // Fora de qualquer condicional: a fonte cobre só o Brasil (FR-005 da 002).
    country: BRAZIL_COUNTRY_CODE,
    latitude: hasCoordinates ? entry.latitude : null,
    longitude: hasCoordinates ? entry.longitude : null,
    runways: runways.map((runway) => ({
      ident: runway.ident,
      lengthMeters: runway.lengthMeters,
      widthMeters: runway.widthMeters,
    })),
  };
}

export function toProcedure(
  chart: ChartSummary,
  storageKey: string | null,
  archivedAt: Date | null,
): AirportProcedure {
  return {
    id: chart.id,
    airportIcao: chart.airportIcao.toUpperCase(),
    name: chart.name,
    type: chart.type,
    amendment: chart.amendment,
    sourceUrl: chart.link,
    storageKey,
    archivedAt: storageKey === null ? null : archivedAt,
  };
}

/** Nome, cidade, UF, país e coordenadas; pistas ficam de fora (`sameRunways`). */
export function sameCatalogData(entry: AirportCatalogEntry, persisted: Airport): boolean {
  const expected = toAirport(entry, []);
  return (
    expected.name === persisted.name &&
    expected.city === persisted.city &&
    expected.state === persisted.state &&
    expected.country === persisted.country &&
    sameCoordinate(expected.latitude, persisted.latitude) &&
    sameCoordinate(expected.longitude, persisted.longitude)
  );
}

/** Mesmo conjunto de pistas, em qualquer ordem — a fonte não garante a ordem. */
export function sameRunways(
  incoming: readonly AirportRunway[],
  persisted: readonly AirportRunway[],
): boolean {
  if (incoming.length !== persisted.length) {
    return false;
  }
  const byIdent = new Map(persisted.map((runway) => [runway.ident, runway]));
  return incoming.every((runway) => {
    const current = byIdent.get(runway.ident);
    return (
      current !== undefined &&
      current.lengthMeters === runway.lengthMeters &&
      current.widthMeters === runway.widthMeters
    );
  });
}

/**
 * Mesmo conjunto de cartas com os mesmos campos. `archivedAt`, `createdAt` e
 * `updatedAt` não contam: são registro da coleta, não dado da fonte.
 */
export function sameProcedures(
  incoming: readonly AirportProcedure[],
  persisted: readonly AirportProcedure[],
): boolean {
  if (incoming.length !== persisted.length) {
    return false;
  }
  const byId = new Map(persisted.map((procedure) => [procedure.id, procedure]));
  return incoming.every((procedure) => {
    const current = byId.get(procedure.id);
    return (
      current !== undefined &&
      current.airportIcao === procedure.airportIcao &&
      current.name === procedure.name &&
      current.type === procedure.type &&
      current.amendment === procedure.amendment &&
      current.sourceUrl === procedure.sourceUrl &&
      current.storageKey === procedure.storageKey
    );
  });
}

/** A fonte publica até 12 casas; o banco guarda 6. Comparar sem arredondar acusaria mudança sempre. */
function sameCoordinate(incoming: number | null, persisted: number | null): boolean {
  if (incoming === null || persisted === null) {
    return incoming === persisted;
  }
  return Number(incoming.toFixed(COORDINATE_DECIMALS)) === persisted;
}
