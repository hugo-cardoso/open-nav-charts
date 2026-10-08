import type {
  AirportCatalogEntry,
  AisWebClient,
  ChartSummary,
  IfrChartCatalog,
} from "@open-nav-charts/aisweb-client";
import type {
  AirportSnapshotRepository,
  AirportSyncRepository,
  RunwaysCheckOf,
  SourceSyncStateRepository,
} from "@open-nav-charts/domain";
import pLimit from "p-limit";
import type { Clock } from "../../runtime/clock.js";
import type { Job } from "../../runtime/job.js";
import type { ProgressReporter } from "../../runtime/progress-reporter.js";
import type { RetryPolicy } from "../../runtime/retry-policy.js";
import type { Phase, RunReport } from "../../runtime/run-report.js";
import type { ChartArchiver } from "./chart-archiver.js";
import type { ChartTypeAudit } from "./chart-type-audit.js";
import { pageOffset, totalPages } from "./pagination.js";
import type { ProcessAirport } from "./process-airport.js";
import { type AirportPlan, planSync } from "./sync-planner.js";

/** Chave do indicador de atualização das cartas IFR em `source_sync_state`. */
export const IFR_CHARTS_SOURCE = "aisweb-ifr-charts";

/** Revalidações sem mudança gravadas por `UPDATE`, para não montar um comando gigante. */
const MARK_BATCH_SIZE = 1000;

export interface CrawlerOptions {
  readonly pageSize: number;
  readonly concurrency: number;
  /** Vazio significa varredura completa; preenchido restringe aos ICAOs dados. */
  readonly only: readonly string[];
  /** Ignora o atalho: revalida as pistas de todos e grava o que diferir. */
  readonly force: boolean;
  /** Idade a partir da qual as pistas de um aeródromo vencem (FR-007). */
  readonly revalidationDays: number;
  /** Máximo de revalidações por idade numa execução (research R5). */
  readonly revalidationBudget: number;
  readonly skipDocuments: boolean;
}

export interface DeceaCrawlerJobOptions {
  readonly client: AisWebClient;
  readonly processAirport: ProcessAirport;
  readonly archiver: ChartArchiver;
  readonly snapshots: AirportSnapshotRepository;
  readonly syncState: SourceSyncStateRepository;
  readonly sync: AirportSyncRepository;
  readonly retry: RetryPolicy;
  readonly progress: ProgressReporter;
  readonly report: RunReport;
  readonly audit: ChartTypeAudit;
  readonly clock: Clock;
  readonly options: CrawlerOptions;
}

interface Catalog {
  readonly entries: readonly AirportCatalogEntry[];
  readonly rejected: readonly string[];
}

/**
 * Cuida da varredura: lê a fonte e a base em lote, decide o que fazer com cada
 * aeródromo e distribui o trabalho. Um aeródromo é assunto de `ProcessAirport`;
 * essa divisão é o que faz a política de tentativas envolver o caso de uso
 * inteiro sem que ele saiba.
 */
export class DeceaCrawlerJob implements Job {
  readonly name = "decea-crawler";
  readonly description = "Coleta aeródromos, cartas IFR e documentos do DECEA";

  private readonly client: AisWebClient;
  private readonly processAirport: ProcessAirport;
  private readonly archiver: ChartArchiver;
  private readonly snapshots: AirportSnapshotRepository;
  private readonly syncState: SourceSyncStateRepository;
  private readonly sync: AirportSyncRepository;
  private readonly retry: RetryPolicy;
  private readonly progress: ProgressReporter;
  private readonly report: RunReport;
  private readonly audit: ChartTypeAudit;
  private readonly clock: Clock;
  private readonly options: CrawlerOptions;

  constructor(options: DeceaCrawlerJobOptions) {
    this.client = options.client;
    this.processAirport = options.processAirport;
    this.archiver = options.archiver;
    this.snapshots = options.snapshots;
    this.syncState = options.syncState;
    this.sync = options.sync;
    this.retry = options.retry;
    this.progress = options.progress;
    this.report = options.report;
    this.audit = options.audit;
    this.clock = options.clock;
    this.options = options.options;
  }

  async run(signal: AbortSignal): Promise<RunReport> {
    this.progress.jobStarted(this.options.concurrency);

    // 1. Tudo o que a decisão exige, de uma vez e em paralelo: duas consultas à
    //    fonte no lugar de uma por aeródromo (research R2, R3, R6). Sem algum
    //    deles não há decisão segura, então a falha encerra a execução sem
    //    gravar nada.
    const [catalog, ifrCharts, snapshots, archivedKeys] = await Promise.all([
      this.timed("catalog", () => this.loadCatalog(signal)),
      this.timed("charts", () =>
        this.retry.execute(() => this.client.fetchIfrChartCatalog(), {
          signal,
          onRetry: (attempt, maxAttempts, error) => {
            this.progress.airportRetrying("cartas", attempt, maxAttempts, describe(error));
          },
        }),
      ),
      this.timed("database", () => this.snapshots.loadAll()),
      this.options.skipDocuments
        ? Promise.resolve(null)
        : this.timed("documents", () => this.archiver.listArchivedKeys()),
    ]);
    this.progress.sourceLoaded(catalog.entries.length, ifrCharts.charts.length);

    // 2. O indicador é global: o que importa é desde quando ele vale (research R5).
    const state = await this.timed("database", () =>
      this.syncState.observe(
        IFR_CHARTS_SOURCE,
        { lastUpdate: ifrCharts.lastUpdate, airacCycle: ifrCharts.airacCycle },
        this.clock.now(),
      ),
    );
    this.report.recordSource(state);

    // 3. A decisão, sem I/O.
    const plan = planSync({
      catalog: catalog.entries,
      charts: ifrCharts.charts,
      snapshots,
      archivedKeys,
      buildKey: (icao, id) => this.archiver.keyOf(icao, id),
      observedAt: state.observedAt,
      now: this.clock.now(),
      options: this.options,
    });
    this.recordPlanFindings(catalog, ifrCharts, plan.airports, plan.chartsOutsideCatalog);
    this.report.recordRevalidationsDeferred(plan.agedOutDeferred);

    // 4. Só os aeródromos com trabalho entram na fila.
    const work = plan.airports.filter(
      (airport) => airport.runwaysReason !== null || airport.writeReasons.length > 0,
    );
    this.report.recordPlanned(plan.airports.length);
    this.report.recordUnchanged(plan.airports.length - work.length);
    this.progress.planned(work.length, plan.airports.length - work.length);

    const confirmed: RunwaysCheckOf[] = [];
    await this.processQueue(work, signal, confirmed);
    // Gravado mesmo após interrupção: cada revalidação já foi concluída.
    await this.markRunwaysChecked(confirmed);

    this.reportUnknownTypes();
    return this.report;
  }

  /**
   * Paginação mantida para o caso de o catálogo passar do tamanho de página; com
   * o padrão de 5.000 é uma requisição só. Página vazia encerra mesmo com `total`
   * sugerindo mais — protege contra catálogo que muda durante a leitura.
   */
  private async loadCatalog(signal: AbortSignal): Promise<Catalog> {
    const { pageSize } = this.options;
    const entries: AirportCatalogEntry[] = [];
    const rejected: string[] = [];

    let pages = 1;
    for (let page = 1; page <= pages; page += 1) {
      signal.throwIfAborted();
      const result = await this.retry.execute(
        () => this.client.listAirports(pageOffset(page, pageSize), pageSize),
        {
          signal,
          onRetry: (attempt, maxAttempts, error) => {
            this.progress.airportRetrying("catálogo", attempt, maxAttempts, describe(error));
          },
        },
      );
      if (result.entries.length === 0 && result.rejected.length === 0) {
        break;
      }
      entries.push(...result.entries);
      rejected.push(...result.rejected);
      pages = totalPages(result.total, pageSize);
    }

    return { entries, rejected };
  }

  private recordPlanFindings(
    catalog: Catalog,
    ifrCharts: IfrChartCatalog,
    airports: readonly AirportPlan[],
    outside: readonly ChartSummary[],
  ): void {
    for (const reason of catalog.rejected) {
      this.report.recordWarning(reason);
    }

    // Pedido explícito que a fonte não tem não pode sumir em silêncio.
    const inCatalog = new Set(catalog.entries.map((entry) => entry.icao));
    for (const icao of this.options.only) {
      if (!inCatalog.has(icao.toUpperCase())) {
        this.report.recordFailure(icao.toUpperCase(), "não consta no catálogo AD da fonte");
      }
    }

    // Auditoria de tipos sobre as cartas que serão de fato persistidas
    // (FR-012 da 002): a carta segue gravada, o alerta só sinaliza.
    for (const airport of airports) {
      for (const chart of airport.charts) {
        const wasUnknown = this.audit.isUnknown(chart.type);
        this.audit.record(chart.type);
        if (wasUnknown) {
          this.report.recordWarning(
            `${chart.airportIcao}: tipo de carta desconhecido "${chart.type}" na espécie IFR (carta ${chart.id})`,
          );
        }
      }
    }

    this.report.recordChartsOutsideCatalog(outside.length);
    if (outside.length > 0) {
      const icaos = new Set(outside.map((chart) => chart.airportIcao));
      this.report.recordWarning(
        `${outside.length} cartas IFR de ${icaos.size} aeródromos fora do catálogo AD ignoradas (de ${ifrCharts.charts.length} no lote)`,
      );
    }
  }

  /**
   * Fila única com no máximo `concurrency` aeródromos em voo (FR-009, FR-011):
   * uma linha livre pega o próximo item na hora, sem esperar o grupo.
   */
  private async processQueue(
    work: readonly AirportPlan[],
    signal: AbortSignal,
    confirmed: RunwaysCheckOf[],
  ): Promise<void> {
    const limit = pLimit(this.options.concurrency);
    let announcedInterruption = false;

    await Promise.all(
      work.map((plan) =>
        limit(async () => {
          if (signal.aborted) {
            // Nenhum aeródromo novo é iniciado; os em curso terminam.
            if (!announcedInterruption) {
              announcedInterruption = true;
              this.progress.interrupted();
            }
            return;
          }
          await this.processOne(plan, signal, confirmed);
        }),
      ),
    );
  }

  private async processOne(
    plan: AirportPlan,
    signal: AbortSignal,
    confirmed: RunwaysCheckOf[],
  ): Promise<void> {
    const { icao } = plan.entry;
    try {
      const outcome = await this.retry.execute(() => this.processAirport.execute(plan, signal), {
        signal,
        onRetry: (attempt, maxAttempts, error) => {
          this.progress.airportRetrying(icao, attempt, maxAttempts, describe(error));
        },
      });
      this.report.recordSuccess(outcome);
      if (outcome.result === "runways-confirmed" && outcome.runwaysCheck !== null) {
        confirmed.push(outcome.runwaysCheck);
      }
      this.progress.airportSucceeded(icao, outcome.name, plan.charts.length);
    } catch (error) {
      if (signal.aborted) {
        // Interrupção não é falha do aeródromo: a execução seguinte refaz o pendente.
        return;
      }
      const reason = describe(error);
      this.report.recordAirportFailure(icao, reason);
      this.progress.airportFailed(icao, reason);
    }
  }

  private async markRunwaysChecked(checks: readonly RunwaysCheckOf[]): Promise<void> {
    for (let start = 0; start < checks.length; start += MARK_BATCH_SIZE) {
      const batch = checks.slice(start, start + MARK_BATCH_SIZE);
      await this.timed("database", () => this.sync.markRunwaysChecked(batch));
    }
  }

  private timed<T>(phase: Phase, operation: () => Promise<T>): Promise<T> {
    return this.report.time(phase, this.clock, operation);
  }

  private reportUnknownTypes(): void {
    const unknown = this.audit.unknownTypes;
    if (unknown.length > 0) {
      this.report.recordWarning(
        `tipos de carta fora das 13 siglas conhecidas da espécie IFR: ${unknown.join(", ")}`,
      );
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
