import type { Airport, AirportProcedure, AirportSummary } from "../entities/index.js";

/**
 * Contratos de persistência. Consumidores os recebem por injeção de construtor
 * (Princípio III); as implementações Drizzle só são nomeadas na raiz de composição.
 */

/**
 * Critério da listagem paginada. Chega já validado e normalizado pela camada de
 * entrada — o repositório confia nos valores recebidos.
 */
export interface AirportListQuery {
  /** Inteiro maior ou igual a 1. */
  readonly page: number;
  /** Inteiro entre 1 e 100. */
  readonly pageSize: number;
  /** Duas letras maiúsculas quando presente. */
  readonly state?: string | undefined;
  /** Termo já normalizado por `normalizeSearchText`, não vazio. */
  readonly search?: string | undefined;
}

export interface AirportPage {
  /** Sem pistas: a listagem não as carrega. */
  readonly items: readonly AirportSummary[];
  /** Total que atende ao critério, ignorando a paginação. */
  readonly total: number;
}

export interface AirportRepository {
  findByIcao(icao: string): Promise<Airport | null>;
  listByState(state: string): Promise<readonly Airport[]>;
  /** Página ordenada por ICAO ascendente — percorrer todas não repete nem omite. */
  list(query: AirportListQuery): Promise<AirportPage>;
  /** Upsert por ICAO; substitui as pistas integralmente. Idempotente. */
  save(airport: Airport): Promise<void>;
}

export interface AirportProcedureRepository {
  listByAirport(icao: string): Promise<readonly AirportProcedure[]>;
  /** Resolve um procedimento pelo id, sem carregar os demais do aeródromo. */
  findById(id: string): Promise<AirportProcedure | null>;
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
