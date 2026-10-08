import type {
  AirportCatalogEntry,
  AirportCatalogPage,
  AirportDetails,
  AisWebClient,
  ChartSummary,
  IfrChartCatalog,
} from "@open-nav-charts/aisweb-client";
import type {
  AirportSnapshot,
  AirportSnapshotRepository,
  AirportSyncInput,
  AirportSyncRepository,
  AirportSyncResult,
  RunwaysCheckOf,
  SourceSyncState,
  SourceSyncStateRepository,
  SourceSyncValue,
} from "@open-nav-charts/domain";
import { assertPdfContent, type ChartStorage } from "@open-nav-charts/object-storage";
import type { ProgressReporter } from "../runtime/progress-reporter.js";

/**
 * Dublês em memória usados pelos testes unitários. Implementam as mesmas
 * interfaces que a produção — nenhum monkey-patching de módulo (Princípio III).
 */

export interface FakeAisWebOptions {
  readonly airports?: Readonly<Record<string, AirportDetails | (() => AirportDetails)>>;
  readonly charts?: Readonly<
    Record<string, readonly ChartSummary[] | (() => readonly ChartSummary[])>
  >;
  readonly documents?: Readonly<Record<string, Uint8Array | (() => Uint8Array)>>;
  /** Catálogo em lote; sem ele, derivado de `airports`. */
  readonly catalog?: readonly AirportCatalogEntry[] | (() => readonly AirportCatalogEntry[]);
  /** Lote de cartas IFR; sem ele, derivado de `charts`. */
  readonly chartCatalog?: IfrChartCatalog | (() => IfrChartCatalog);
  /**
   * Atraso artificial de cada requisição à fonte. Com `0` as requisições já se
   * sobrepõem no laço de eventos, o que basta para medir o pico em voo.
   */
  readonly delayMs?: number | ((operation: string) => number);
}

export class FakeAisWebClient implements AisWebClient {
  readonly fetchedAirports: string[] = [];
  readonly downloadedCharts: string[] = [];
  readonly catalogRequests: Array<{ offset: number; limit: number }> = [];
  chartCatalogRequests = 0;
  /** Maior número de requisições à fonte em voo ao mesmo tempo. */
  peakInFlight = 0;
  private inFlight = 0;
  private readonly options: FakeAisWebOptions;

  constructor(options: FakeAisWebOptions = {}) {
    this.options = options;
  }

  async listAirports(offset: number, limit: number): Promise<AirportCatalogPage> {
    return this.request("catalog", () => {
      this.catalogRequests.push({ offset, limit });
      const catalog = this.catalogEntries();
      return {
        total: catalog.length,
        entries: catalog.slice(offset, offset + limit),
        rejected: [],
      };
    });
  }

  async fetchIfrChartCatalog(): Promise<IfrChartCatalog> {
    return this.request("charts", () => {
      this.chartCatalogRequests += 1;
      const configured = this.options.chartCatalog;
      if (configured !== undefined) {
        return typeof configured === "function" ? configured() : configured;
      }
      const charts = Object.values(this.options.charts ?? {}).flatMap((entry) =>
        typeof entry === "function" ? entry() : entry,
      );
      return { lastUpdate: "2026-09-30 17:35:34", airacCycle: "2026-10-01", charts };
    });
  }

  private catalogEntries(): readonly AirportCatalogEntry[] {
    const configured = this.options.catalog;
    if (configured !== undefined) {
      return typeof configured === "function" ? configured() : configured;
    }
    return Object.keys(this.options.airports ?? {}).map((icao) => catalogEntry({ icao }));
  }

  private async request<T>(operation: string, produce: () => T): Promise<T> {
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
    try {
      const delay = this.options.delayMs;
      const milliseconds = typeof delay === "function" ? delay(operation) : (delay ?? 0);
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
      return produce();
    } finally {
      this.inFlight -= 1;
    }
  }

  async fetchAirport(icao: string): Promise<AirportDetails> {
    return this.request("airport", () => {
      this.fetchedAirports.push(icao);
      const entry = this.options.airports?.[icao];
      if (entry === undefined) {
        return {
          icao,
          name: `Aeródromo ${icao}`,
          city: null,
          state: null,
          latitude: null,
          longitude: null,
          runways: [],
        };
      }
      return typeof entry === "function" ? entry() : entry;
    });
  }

  async downloadChart(chart: ChartSummary): Promise<Uint8Array> {
    return this.request("download", () => {
      this.downloadedCharts.push(chart.id);
      const entry = this.options.documents?.[chart.id];
      if (entry === undefined) {
        return pdfBytes();
      }
      return typeof entry === "function" ? entry() : entry;
    });
  }
}

/**
 * Base em memória: grava como a transação real e devolve o retrato do que
 * gravou, para que a execução seguinte de um teste enxergue a anterior.
 */
export class FakeAirportSyncRepository implements AirportSyncRepository, AirportSnapshotRepository {
  readonly calls: AirportSyncInput[] = [];
  readonly markedChecks: RunwaysCheckOf[] = [];
  private readonly store = new Map<string, AirportSnapshot>();
  private removedIds: readonly string[] | null = null;
  private _onSync: (() => void) | null = null;

  withRemovedIds(ids: readonly string[]): this {
    this.removedIds = ids;
    return this;
  }

  onSync(callback: () => void): this {
    this._onSync = callback;
    return this;
  }

  /** Semeia a base como se uma execução anterior a tivesse gravado. */
  seed(snapshot: AirportSnapshot): this {
    this.store.set(snapshot.airport.icao, snapshot);
    return this;
  }

  snapshot(icao: string): AirportSnapshot | undefined {
    return this.store.get(icao);
  }

  async syncAirport(input: AirportSyncInput): Promise<AirportSyncResult> {
    this._onSync?.();
    this.calls.push(input);

    const current = this.store.get(input.airport.icao);
    const incoming = new Set(input.procedures.map((procedure) => procedure.id));
    const removed = (current?.procedures ?? [])
      .map((procedure) => procedure.id)
      .filter((id) => !incoming.has(id));

    this.store.set(input.airport.icao, {
      airport: input.airport,
      procedures: input.procedures,
      runwaysCheckedAt: input.runwaysCheck?.at ?? current?.runwaysCheckedAt ?? null,
      sourceUpdatedOn: input.runwaysCheck?.sourceUpdatedOn ?? current?.sourceUpdatedOn ?? null,
    });

    return { removedProcedureIds: this.removedIds ?? removed };
  }

  async markRunwaysChecked(checks: readonly RunwaysCheckOf[]): Promise<void> {
    for (const check of checks) {
      this.markedChecks.push(check);
      const current = this.store.get(check.icao);
      if (current !== undefined) {
        this.store.set(check.icao, {
          ...current,
          runwaysCheckedAt: check.at,
          sourceUpdatedOn: check.sourceUpdatedOn,
        });
      }
    }
  }

  async loadAll(): Promise<ReadonlyMap<string, AirportSnapshot>> {
    return new Map(this.store);
  }
}

export class FakeSourceSyncStateRepository implements SourceSyncStateRepository {
  readonly observations: Array<{ value: SourceSyncValue; at: Date }> = [];
  private state: SourceSyncState | null = null;

  seed(state: SourceSyncState): this {
    this.state = state;
    return this;
  }

  async find(): Promise<SourceSyncState | null> {
    return this.state;
  }

  async observe(source: string, value: SourceSyncValue, at: Date): Promise<SourceSyncState> {
    this.observations.push({ value, at });
    const unchanged =
      this.state !== null &&
      this.state.lastUpdate === value.lastUpdate &&
      this.state.airacCycle === value.airacCycle;
    this.state = {
      source,
      ...value,
      observedAt: unchanged && this.state !== null ? this.state.observedAt : at,
    };
    return this.state;
  }
}

export class FakeChartStorage implements ChartStorage {
  readonly objects = new Map<string, Uint8Array>();
  readonly putKeys: string[] = [];
  readonly deletedKeys: string[] = [];
  private _onPut: ((key: string) => void) | null = null;
  private _onDelete: ((key: string) => void) | null = null;

  onPut(callback: (key: string) => void): this {
    this._onPut = callback;
    return this;
  }

  onDelete(callback: (key: string) => void): this {
    this._onDelete = callback;
    return this;
  }

  buildKey(icao: string, procedureId: string): string {
    return `${icao.toUpperCase()}/${procedureId}.pdf`;
  }

  existsCalls = 0;
  listKeysCalls = 0;

  async exists(key: string): Promise<boolean> {
    this.existsCalls += 1;
    return this.objects.has(key);
  }

  async listKeys(): Promise<ReadonlySet<string>> {
    this.listKeysCalls += 1;
    return new Set(this.objects.keys());
  }

  async put(key: string, content: Uint8Array): Promise<void> {
    // Valida como a implementação real: sem isso o dublê aceitaria lixo que a
    // produção rejeita, e o teste passaria por engano (FR-019).
    assertPdfContent(content, key);
    this._onPut?.(key);
    this.putKeys.push(key);
    this.objects.set(key, content);
  }

  async delete(key: string): Promise<void> {
    this._onDelete?.(key);
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }

  /** A rotina de coleta não assina URLs; existe só para cumprir o contrato. */
  async presignGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    return `https://bucket.example/${key}?expires=${expiresInSeconds}`;
  }
}

export class RecordingProgressReporter implements ProgressReporter {
  readonly lines: string[] = [];

  jobStarted(concurrency: number): void {
    this.lines.push(`start ${concurrency}`);
  }

  sourceLoaded(airports: number, charts: number): void {
    this.lines.push(`source ${airports} ${charts}`);
  }

  planned(toProcess: number, unchanged: number): void {
    this.lines.push(`planned ${toProcess} ${unchanged}`);
  }

  airportSucceeded(icao: string, name: string, chartCount: number): void {
    this.lines.push(`ok ${icao} ${name} ${chartCount}`);
  }

  airportRetrying(icao: string, attempt: number, maxAttempts: number, reason: string): void {
    this.lines.push(`retry ${icao} ${attempt}/${maxAttempts} ${reason}`);
  }

  airportFailed(icao: string, reason: string): void {
    this.lines.push(`fail ${icao} ${reason}`);
  }

  interrupted(): void {
    this.lines.push("interrupted");
  }

  summary(text: string): void {
    this.lines.push(`summary\n${text}`);
  }
}

export function pdfBytes(content = "%PDF-1.7 documento de teste"): Uint8Array {
  return new TextEncoder().encode(content);
}

export function chart(overrides: Partial<ChartSummary> & Pick<ChartSummary, "id">): ChartSummary {
  return {
    airportIcao: "SBGL",
    name: `Carta ${overrides.id}`,
    type: "IAC",
    amendment: "2601A1",
    link: `https://aisweb.example/download/?arquivo=${overrides.id}`,
    ...overrides,
  };
}

export function airportDetails(
  overrides: Partial<AirportDetails> & Pick<AirportDetails, "icao">,
): AirportDetails {
  return {
    name: `Aeródromo ${overrides.icao}`,
    city: "Cidade",
    state: "RJ",
    latitude: -22.81,
    longitude: -43.250556,
    runways: [],
    ...overrides,
  };
}

export function catalogEntry(
  overrides: Partial<AirportCatalogEntry> & Pick<AirportCatalogEntry, "icao">,
): AirportCatalogEntry {
  return {
    name: `Aeródromo ${overrides.icao}`,
    city: "Cidade",
    state: "RJ",
    latitude: -22.81,
    longitude: -43.250556,
    updatedOn: "2026-01-01",
    ...overrides,
  };
}
