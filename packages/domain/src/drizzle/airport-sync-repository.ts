import { eq } from "drizzle-orm";
import type {
  AirportSyncInput,
  AirportSyncRepository,
  AirportSyncResult,
} from "../repositories/index.js";
import { deleteProceduresWith, saveProceduresWith } from "./airport-procedure-repository.js";
import { saveAirportWith } from "./airport-repository.js";
import type { DrizzleClient } from "./client.js";
import { airportProcedure } from "./schema.js";

/**
 * Grava o agregado inteiro em uma transação: upsert do aeródromo, substituição
 * das pistas e diff das cartas. A atomicidade é garantia do domínio, não do
 * chamador — sem isso o objeto de transação do Drizzle vazaria do pacote.
 */
export class DrizzleAirportSyncRepository implements AirportSyncRepository {
  private readonly db: DrizzleClient;

  constructor(db: DrizzleClient) {
    this.db = db;
  }

  async syncAirport(input: AirportSyncInput): Promise<AirportSyncResult> {
    return this.db.transaction(async (tx) => {
      await saveAirportWith(tx, input.airport);

      const existing = await tx
        .select({ id: airportProcedure.id })
        .from(airportProcedure)
        .where(eq(airportProcedure.airportIcao, input.airport.icao));

      const incomingIds = new Set(input.procedures.map((procedure) => procedure.id));
      const removedProcedureIds = existing
        .map((row) => row.id)
        .filter((id) => !incomingIds.has(id));

      await saveProceduresWith(tx, input.procedures);
      await deleteProceduresWith(tx, removedProcedureIds);

      return { removedProcedureIds };
    });
  }
}
