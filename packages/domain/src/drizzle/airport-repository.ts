import { and, asc, count, eq, inArray, like, type SQL, sql } from "drizzle-orm";
import type { Airport, AirportSummary } from "../entities/index.js";
import type { AirportListQuery, AirportPage, AirportRepository } from "../repositories/index.js";
import type { DrizzleClient } from "./client.js";
import { fromCoordinate, normalizeSearchText, toAirport, toAirportSummary } from "./mappers.js";
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
    // Coluna comum, não gerada: quem grava preenche. Toda escrita de aeródromo
    // passa por aqui, então a rotina de coleta continua inalterada (research R5).
    searchText: normalizeSearchText(`${entity.icao} ${entity.name} ${entity.city ?? ""}`),
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
        searchText: values.searchText,
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

  /**
   * Ordenação por `icao`: chave primária, portanto única e total. É o que garante
   * que percorrer todas as páginas devolva cada aeródromo exatamente uma vez
   * (FR-007, SC-008) — ordenar por nome, que não é único, não garantiria.
   *
   * Não carrega pistas (FR-008): uma consulta a `airport`, sem o segundo `select`
   * nem o agrupamento em memória que `listByState` faz.
   */
  async list(query: AirportListQuery): Promise<AirportPage> {
    const filters: SQL[] = [];
    if (query.state !== undefined) {
      filters.push(eq(airport.state, query.state));
    }
    if (query.search !== undefined) {
      // O termo já chega normalizado; `search_text` foi gravada com a mesma
      // função, então a comparação é acento-insensível dos dois lados.
      filters.push(like(airport.searchText, `%${query.search}%`));
    }
    const where = filters.length === 0 ? undefined : and(...filters);

    const rows = await this.db
      .select()
      .from(airport)
      .where(where)
      .orderBy(asc(airport.icao))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    // Contagem separada: `count(*) over ()` faria o Postgres recalcular o total
    // em cada linha da página, sem ganho nesta escala (research R4).
    const totals = await this.db.select({ value: count() }).from(airport).where(where);

    return {
      items: rows.map((row): AirportSummary => toAirportSummary(row)),
      total: totals[0]?.value ?? 0,
    };
  }

  async save(entity: Airport): Promise<void> {
    await this.db.transaction(async (tx) => {
      await saveAirportWith(tx, entity);
    });
  }
}
