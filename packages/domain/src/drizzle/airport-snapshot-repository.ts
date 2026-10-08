import type { AirportSnapshot, AirportSnapshotRepository } from "../repositories/index.js";
import type { DrizzleClient } from "./client.js";
import { toAirport, toProcedure } from "./mappers.js";
import { airport, airportProcedure, airportRunway } from "./schema.js";

/**
 * Carrega a base inteira em três consultas e monta o retrato em memória. Para a
 * escala do catálogo (~4,5 mil aeródromos, ~9 mil pistas, ~1,8 mil cartas) é
 * mais barato que qualquer leitura por aeródromo.
 */
export class DrizzleAirportSnapshotRepository implements AirportSnapshotRepository {
  private readonly db: DrizzleClient;

  constructor(db: DrizzleClient) {
    this.db = db;
  }

  async loadAll(): Promise<ReadonlyMap<string, AirportSnapshot>> {
    const [airports, runways, procedures] = await Promise.all([
      this.db.select().from(airport),
      this.db.select().from(airportRunway),
      this.db.select().from(airportProcedure),
    ]);

    const runwaysByIcao = groupBy(runways, (row) => row.airportIcao);
    const proceduresByIcao = groupBy(
      procedures.map(toProcedure),
      (procedure) => procedure.airportIcao,
    );

    const snapshots = new Map<string, AirportSnapshot>();
    for (const row of airports) {
      snapshots.set(row.icao, {
        airport: toAirport(row, runwaysByIcao.get(row.icao) ?? []),
        procedures: proceduresByIcao.get(row.icao) ?? [],
        runwaysCheckedAt: row.runwaysCheckedAt,
        sourceUpdatedOn: row.sourceUpdatedOn,
      });
    }
    return snapshots;
  }
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group === undefined) {
      groups.set(key(item), [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
}
