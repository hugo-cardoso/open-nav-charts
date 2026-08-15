import type { Airport, AirportProcedure } from "../entities/index.js";

/**
 * Contratos de persistência. Consumidores os recebem por injeção de construtor
 * (Princípio III); as implementações Drizzle só são nomeadas na raiz de composição.
 */

export interface AirportRepository {
  findByIcao(icao: string): Promise<Airport | null>;
  listByState(state: string): Promise<readonly Airport[]>;
  /** Upsert por ICAO; substitui as pistas integralmente. Idempotente. */
  save(airport: Airport): Promise<void>;
}

export interface AirportProcedureRepository {
  listByAirport(icao: string): Promise<readonly AirportProcedure[]>;
  /** Upsert por id. Idempotente. */
  saveAll(procedures: readonly AirportProcedure[]): Promise<void>;
  deleteByIds(ids: readonly string[]): Promise<void>;
}

export interface AirportSyncInput {
  readonly airport: Airport;
  readonly procedures: readonly AirportProcedure[];
}

export interface AirportSyncResult {
  readonly removedProcedureIds: readonly string[];
}

/**
 * Grava aeródromo, pistas e o diff de cartas em uma única transação.
 * `removedProcedureIds` é o que permite ao chamador apagar os objetos do bucket
 * depois do commit (FR-020).
 */
export interface AirportSyncRepository {
  syncAirport(input: AirportSyncInput): Promise<AirportSyncResult>;
}
