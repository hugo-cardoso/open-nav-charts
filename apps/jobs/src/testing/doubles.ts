import type { AirportDetails, AisWebClient, ChartSummary } from "@open-nav-charts/aisweb-client";
import type {
  AirportSyncInput,
  AirportSyncRepository,
  AirportSyncResult,
} from "@open-nav-charts/domain";
import { assertPdfContent, type ChartStorage } from "@open-nav-charts/object-storage";
import type { ProgressReporter } from "../runtime/progress-reporter.js";

/**
 * Dublês em memória usados pelos testes unitários. Implementam as mesmas
 * interfaces que a produção — nenhum monkey-patching de módulo (Princípio III).
 */

export interface FakeAisWebOptions {
  readonly icaosByPage?: readonly (readonly string[])[];
  readonly total?: number;
  readonly airports?: Readonly<Record<string, AirportDetails | (() => AirportDetails)>>;
  readonly charts?: Readonly<
    Record<string, readonly ChartSummary[] | (() => readonly ChartSummary[])>
  >;
  readonly documents?: Readonly<Record<string, Uint8Array | (() => Uint8Array)>>;
}

export class FakeAisWebClient implements AisWebClient {
  readonly fetchedAirports: string[] = [];
  readonly fetchedCharts: string[] = [];
  readonly downloadedCharts: string[] = [];
  private readonly options: FakeAisWebOptions;

  constructor(options: FakeAisWebOptions = {}) {
    this.options = options;
  }

  async countAirports(): Promise<number> {
    if (this.options.total !== undefined) {
      return this.options.total;
    }
    return (this.options.icaosByPage ?? []).reduce((sum, page) => sum + page.length, 0);
  }

  async listAirportIcaos(offset: number, limit: number): Promise<readonly string[]> {
    const pages = this.options.icaosByPage ?? [];
    const index = Math.floor(offset / limit);
    return pages[index] ?? [];
  }

  async fetchAirport(icao: string): Promise<AirportDetails> {
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
  }

  async fetchIfrCharts(icao: string): Promise<readonly ChartSummary[]> {
    this.fetchedCharts.push(icao);
    const entry = this.options.charts?.[icao];
    if (entry === undefined) {
      return [];
    }
    return typeof entry === "function" ? entry() : entry;
  }

  async downloadChart(chart: ChartSummary): Promise<Uint8Array> {
    this.downloadedCharts.push(chart.id);
    const entry = this.options.documents?.[chart.id];
    if (entry === undefined) {
      return pdfBytes();
    }
    return typeof entry === "function" ? entry() : entry;
  }
}

export class FakeAirportSyncRepository implements AirportSyncRepository {
  readonly calls: AirportSyncInput[] = [];
  private removedIds: readonly string[] = [];
  private _onSync: (() => void) | null = null;

  withRemovedIds(ids: readonly string[]): this {
    this.removedIds = ids;
    return this;
  }

  onSync(callback: () => void): this {
    this._onSync = callback;
    return this;
  }

  async syncAirport(input: AirportSyncInput): Promise<AirportSyncResult> {
    this._onSync?.();
    this.calls.push(input);
    return { removedProcedureIds: this.removedIds };
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

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
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
}

export class RecordingProgressReporter implements ProgressReporter {
  readonly lines: string[] = [];

  jobStarted(totalAirports: number, totalPages: number, concurrency: number): void {
    this.lines.push(`start ${totalAirports} ${totalPages} ${concurrency}`);
  }

  pageStarted(page: number, totalPages: number): void {
    this.lines.push(`page-start ${page}/${totalPages}`);
  }

  pageFinished(page: number, totalPages: number, durationMs: number): void {
    this.lines.push(`page-end ${page}/${totalPages} ${durationMs}`);
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
