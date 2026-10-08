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
  /** Código ISO 3166-1 alpha-2: duas letras maiúsculas quando presente. */
  readonly country?: string | undefined;
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

/**
 * Coleta bem-sucedida do detalhamento (pistas) de um aeródromo. É o que tira o
 * aeródromo da lista de pendentes da rotina de coleta.
 */
export interface RunwaysCheck {
  readonly at: Date;
  /** `<dt>` do registro ROTAER visto nessa coleta. */
  readonly sourceUpdatedOn: string | null;
}

export interface AirportSyncInput {
  readonly airport: Airport;
  readonly procedures: readonly AirportProcedure[];
  /** Presente quando as pistas vieram de um detalhamento bem-sucedido nesta execução. */
  readonly runwaysCheck?: RunwaysCheck;
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
  /**
   * Registra a revalidação das pistas de aeródromos em que ela não mudou nada,
   * sem tocar os demais dados nem `updated_at`. Um único `UPDATE` por lote.
   */
  markRunwaysChecked(checks: readonly RunwaysCheckOf[]): Promise<void>;
}

export interface RunwaysCheckOf extends RunwaysCheck {
  readonly icao: string;
}

/** O que está persistido de um aeródromo, do ponto de vista da rotina de coleta. */
export interface AirportSnapshot {
  readonly airport: Airport;
  readonly procedures: readonly AirportProcedure[];
  readonly runwaysCheckedAt: Date | null;
  readonly sourceUpdatedOn: string | null;
}

/** Retrato da base inteira, carregado uma vez por execução da coleta. */
export interface AirportSnapshotRepository {
  /** Todos os aeródromos, com pistas e cartas, indexados por ICAO. */
  loadAll(): Promise<ReadonlyMap<string, AirportSnapshot>>;
}

export interface SourceSyncState {
  readonly source: string;
  readonly lastUpdate: string | null;
  readonly airacCycle: string | null;
  /** Quando o par (`lastUpdate`, `airacCycle`) foi visto pela primeira vez. */
  readonly observedAt: Date;
}

export interface SourceSyncValue {
  readonly lastUpdate: string | null;
  readonly airacCycle: string | null;
}

export interface SourceSyncStateRepository {
  find(source: string): Promise<SourceSyncState | null>;
  /**
   * Registra o par observado agora. Igual ao registrado: só confirma e devolve o
   * estado com o `observedAt` original. Diferente (inclusive `null` contra
   * valor): substitui, com `observedAt = at`.
   */
  observe(source: string, value: SourceSyncValue, at: Date): Promise<SourceSyncState>;
}
