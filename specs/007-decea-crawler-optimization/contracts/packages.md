# Contratos entre pacotes do workspace — feature 007

Mudanças nas interfaces públicas dos pacotes consumidos por `apps/jobs`. Pelo Princípio IV, cada
uma exige teste de integração do contrato.

---

## `@open-nav-charts/aisweb-client` — `AisWebClient`

```ts
export interface AirportCatalogEntry {
  readonly icao: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** `<dt>`: data da última alteração do registro ROTAER (research R10). */
  readonly updatedOn: string | null;
}

export interface AirportCatalogPage {
  readonly total: number;
  readonly entries: readonly AirportCatalogEntry[];
  /** Itens sem `AeroCode` ou `name`, descartados e descritos para o resumo. */
  readonly rejected: readonly string[];
}

export interface IfrChartCatalog {
  /** `lastupdate` normalizado; `null` se ausente ou ilegível. Global ao conjunto IFR. */
  readonly lastUpdate: string | null;
  /** `emenda` normalizada (data AIRAC); `null` se ausente. */
  readonly airacCycle: string | null;
  readonly charts: readonly ChartSummary[];
}

export interface AisWebClient {
  /** Uma página do catálogo `type=AD`, já com os dados cadastrais (sem pistas). */
  listAirports(offset: number, limit: number): Promise<AirportCatalogPage>;
  /** Todas as cartas IFR numa consulta. Lança retentável se vier truncada. */
  fetchIfrChartCatalog(): Promise<IfrChartCatalog>;
  /** Inalterada. Passa a ser usada só para as pistas. */
  fetchAirport(icao: string): Promise<AirportDetails>;
  /** Inalterada. */
  downloadChart(chart: ChartSummary): Promise<Uint8Array>;
}
```

**Removidos** (sem outro consumidor no workspace): `countAirports`, `listAirportIcaos`,
`fetchIfrCharts`, e com eles `RotaerParser.parseList` e `ChartsParser.parse`. O total do catálogo
passa a vir de `AirportCatalogPage.total`.

O `Database` de `createDatabase` ganha `snapshots: AirportSnapshotRepository` e
`syncState: SourceSyncStateRepository`.

---

## `@open-nav-charts/object-storage` — `ChartStorage`

```ts
export interface ChartStorage {
  // … membros existentes inalterados (buildKey, exists, put, delete, presignGetUrl)

  /**
   * Todas as chaves do bucket, numa leitura paginada (`ListObjectsV2`). Usada uma
   * vez por execução no lugar de um `exists` por carta (research R6).
   */
  listKeys(): Promise<ReadonlySet<string>>;
}
```

---

## `@open-nav-charts/domain` — repositórios

```ts
export interface AirportSnapshot {
  readonly airport: Airport;
  readonly procedures: readonly AirportProcedure[];
  readonly runwaysCheckedAt: Date | null;
  readonly sourceUpdatedOn: string | null;
}

/** Retrato do que está persistido, carregado uma vez por execução (research R4). */
export interface AirportSnapshotRepository {
  /** Todos os aeródromos com pistas, cartas e `runwaysCheckedAt`, indexados por ICAO. */
  loadAll(): Promise<ReadonlyMap<string, AirportSnapshot>>;
}

export interface SourceSyncState {
  readonly source: string;
  readonly lastUpdate: string | null;
  readonly airacCycle: string | null;
  readonly observedAt: Date;
}

export interface SourceSyncValue {
  readonly lastUpdate: string | null;
  readonly airacCycle: string | null;
}

export interface SourceSyncStateRepository {
  find(source: string): Promise<SourceSyncState | null>;
  /**
   * Grava o par observado. Se igual ao registrado, só confirma (`updated_at`) e
   * devolve o estado existente, com o `observedAt` original; se diferente,
   * substitui com `observedAt = at`.
   */
  observe(source: string, value: SourceSyncValue, at: Date): Promise<SourceSyncState>;
}

export interface RunwaysCheck {
  readonly at: Date;
  /** `<dt>` do registro ROTAER visto nessa coleta. */
  readonly sourceUpdatedOn: string | null;
}

export interface RunwaysCheckOf extends RunwaysCheck {
  readonly icao: string;
}

export interface AirportSyncInput {
  readonly airport: Airport;
  readonly procedures: readonly AirportProcedure[];
  /** Presente quando as pistas vieram de um detalhamento bem-sucedido nesta execução. */
  readonly runwaysCheck?: RunwaysCheck;
}

export interface AirportSyncRepository {
  /** Inalterado no comportamento; grava `runwaysCheck` na mesma transação (FR-004). */
  syncAirport(input: AirportSyncInput): Promise<AirportSyncResult>;
  /** Marca revalidações sem outra mudança, num único `UPDATE … FROM (VALUES …)`. */
  markRunwaysChecked(checks: readonly RunwaysCheckOf[]): Promise<void>;
}
```

**Regra de `archived_at`** (data-model): `saveProceduresWith` passa a preservar `archived_at`
quando `storage_key` não muda, em vez de sobrescrevê-lo.

Os repositórios de leitura usados pela API (`AirportRepository`, `AirportProcedureRepository`)
**não mudam**.
