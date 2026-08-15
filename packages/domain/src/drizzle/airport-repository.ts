import { eq, inArray, sql } from "drizzle-orm";
import type { Airport } from "../entities/index.js";
import type { AirportRepository } from "../repositories/index.js";
import type { DrizzleClient } from "./client.js";
import { fromCoordinate, toAirport } from "./mappers.js";
import { airport, airportRunway } from "./schema.js";

/** Transação do Drizzle ou o próprio cliente — ambos aceitam as mesmas queries. */
export type Executor = DrizzleClient | Parameters<Parameters<DrizzleClient["transaction"]>[0]>[0];

/**
 * Grava o aeródromo e substitui integralmente suas pistas. Compartilhado com o
 * repositório de sincronização, que o executa dentro de sua transação.
 */
export async function saveAirportWith(executor: Executor, entity: Airport): Promise<void> {
  const values = {
    icao: entity.icao,
    name: entity.name,
    city: entity.city,
    state: entity.state,
    latitude: fromCoordinate(entity.latitude),
    longitude: fromCoordinate(entity.longitude),
  };

  await executor
    .insert(airport)
    .values(values)
    .onConflictDoUpdate({
      target: airport.icao,
      set: {
        name: values.name,
        city: values.city,
        state: values.state,
        latitude: values.latitude,
        longitude: values.longitude,
        updatedAt: sql`now()`,
      },
    });

  // Substituição integral: a fonte não dá identificador estável de pista, então
  // apagar e reinserir é mais simples e mais correto que um diff por ident.
  await executor.delete(airportRunway).where(eq(airportRunway.airportIcao, entity.icao));

  // `(airport_icao, ident)` é único: uma lista com o mesmo ident repetido
  // derrubaria a transação inteira do aeródromo. A fonte já é normalizada no
  // parser; esta é a defesa da fronteira de persistência contra qualquer
  // chamador.
  const uniqueRunways = new Map(entity.runways.map((runway) => [runway.ident, runway]));

  if (uniqueRunways.size > 0) {
    await executor.insert(airportRunway).values(
      [...uniqueRunways.values()].map((runway) => ({
        airportIcao: entity.icao,
        ident: runway.ident,
        lengthM: runway.lengthMeters,
        widthM: runway.widthMeters,
      })),
    );
  }
}

export class DrizzleAirportRepository implements AirportRepository {
  private readonly db: DrizzleClient;

  constructor(db: DrizzleClient) {
    this.db = db;
  }

  async findByIcao(icao: string): Promise<Airport | null> {
    const rows = await this.db.select().from(airport).where(eq(airport.icao, icao)).limit(1);
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    const runways = await this.db
      .select()
      .from(airportRunway)
      .where(eq(airportRunway.airportIcao, icao));
    return toAirport(row, runways);
  }

  async listByState(state: string): Promise<readonly Airport[]> {
    const rows = await this.db.select().from(airport).where(eq(airport.state, state));
    if (rows.length === 0) {
      return [];
    }
    const runways = await this.db
      .select()
      .from(airportRunway)
      .where(
        inArray(
          airportRunway.airportIcao,
          rows.map((row) => row.icao),
        ),
      );
    return rows.map((row) =>
      toAirport(
        row,
        runways.filter((runway) => runway.airportIcao === row.icao),
      ),
    );
  }

  async save(entity: Airport): Promise<void> {
    await this.db.transaction(async (tx) => {
      await saveAirportWith(tx, entity);
    });
  }
}
