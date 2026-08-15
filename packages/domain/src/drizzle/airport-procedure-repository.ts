import { eq, inArray, sql } from "drizzle-orm";
import type { AirportProcedure } from "../entities/index.js";
import type { AirportProcedureRepository } from "../repositories/index.js";
import type { Executor } from "./airport-repository.js";
import type { DrizzleClient } from "./client.js";
import { toProcedure } from "./mappers.js";
import { airportProcedure } from "./schema.js";

/** Upsert por id. Compartilhado com a transação do repositório de sincronização. */
export async function saveProceduresWith(
  executor: Executor,
  procedures: readonly AirportProcedure[],
): Promise<void> {
  if (procedures.length === 0) {
    return;
  }

  await executor
    .insert(airportProcedure)
    .values(
      procedures.map((procedure) => ({
        id: procedure.id,
        airportIcao: procedure.airportIcao,
        name: procedure.name,
        type: procedure.type,
        amendment: procedure.amendment,
        sourceUrl: procedure.sourceUrl,
        storageKey: procedure.storageKey,
        archivedAt: procedure.archivedAt,
      })),
    )
    .onConflictDoUpdate({
      target: airportProcedure.id,
      set: {
        airportIcao: sql`excluded.airport_icao`,
        name: sql`excluded.name`,
        type: sql`excluded.type`,
        amendment: sql`excluded.amendment`,
        sourceUrl: sql`excluded.source_url`,
        // Documento já arquivado não é rebaixado a nulo por uma coleta que pulou
        // os PDFs (--skip-documents): o objeto continua no bucket e endereçado.
        storageKey: sql`coalesce(excluded.storage_key, ${airportProcedure.storageKey})`,
        archivedAt: sql`coalesce(excluded.archived_at, ${airportProcedure.archivedAt})`,
        updatedAt: sql`now()`,
      },
    });
}

export async function deleteProceduresWith(
  executor: Executor,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await executor.delete(airportProcedure).where(inArray(airportProcedure.id, [...ids]));
}

export class DrizzleAirportProcedureRepository implements AirportProcedureRepository {
  private readonly db: DrizzleClient;

  constructor(db: DrizzleClient) {
    this.db = db;
  }

  async listByAirport(icao: string): Promise<readonly AirportProcedure[]> {
    const rows = await this.db
      .select()
      .from(airportProcedure)
      .where(eq(airportProcedure.airportIcao, icao));
    return rows.map(toProcedure);
  }

  async findById(id: string): Promise<AirportProcedure | null> {
    const rows = await this.db
      .select()
      .from(airportProcedure)
      .where(eq(airportProcedure.id, id))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toProcedure(row);
  }

  async saveAll(procedures: readonly AirportProcedure[]): Promise<void> {
    await saveProceduresWith(this.db, procedures);
  }

  async deleteByIds(ids: readonly string[]): Promise<void> {
    await deleteProceduresWith(this.db, ids);
  }
}
