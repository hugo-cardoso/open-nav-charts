import { eq, sql } from "drizzle-orm";
import type {
  AirportSyncInput,
  AirportSyncRepository,
  AirportSyncResult,
  RunwaysCheckOf,
} from "../repositories/index.js";
import { deleteProceduresWith, saveProceduresWith } from "./airport-procedure-repository.js";
import { saveAirportWith } from "./airport-repository.js";
import type { DrizzleClient } from "./client.js";
import { airport, airportProcedure } from "./schema.js";

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
      if (input.runwaysCheck !== undefined) {
        // Na mesma transação dos dados: a revalidação só conta se eles foram
        // gravados (FR-004).
        await tx
          .update(airport)
          .set({
            runwaysCheckedAt: input.runwaysCheck.at,
            sourceUpdatedOn: input.runwaysCheck.sourceUpdatedOn,
          })
          .where(eq(airport.icao, input.airport.icao));
      }

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

  /**
   * Um único `UPDATE … FROM (VALUES …)`: com o orçamento de revalidação, são
   * centenas de aeródromos por execução, e uma ida ao banco por linha pesaria.
   * `updated_at` não é tocado — os dados do aeródromo não mudaram.
   */
  async markRunwaysChecked(checks: readonly RunwaysCheckOf[]): Promise<void> {
    if (checks.length === 0) {
      return;
    }
    const rows = sql.join(
      checks.map(
        (check) =>
          sql`(${check.icao}, ${check.at.toISOString()}::timestamptz, ${check.sourceUpdatedOn}::text)`,
      ),
      sql`, `,
    );
    await this.db.execute(sql`
      update ${airport}
      set runways_checked_at = checks.checked_at,
          source_updated_on = checks.source_updated_on
      from (values ${rows}) as checks(icao, checked_at, source_updated_on)
      where ${airport.icao} = checks.icao
    `);
  }
}
