import type { AisWebClient } from "@open-nav-charts/aisweb-client";
import pLimit from "p-limit";
import type { Clock } from "../../runtime/clock.js";
import type { Job } from "../../runtime/job.js";
import type { ProgressReporter } from "../../runtime/progress-reporter.js";
import type { RetryPolicy } from "../../runtime/retry-policy.js";
import type { RunReport } from "../../runtime/run-report.js";
import type { ChartTypeAudit } from "./chart-type-audit.js";
import { pageOffset, totalPages } from "./pagination.js";
import type { ProcessAirport } from "./process-airport.js";

export interface CrawlerOptions {
  readonly pageSize: number;
  readonly concurrency: number;
  /** Vazio significa varredura completa; preenchido restringe aos ICAOs dados. */
  readonly only: readonly string[];
}

export interface DeceaCrawlerJobOptions {
  readonly client: AisWebClient;
  readonly processAirport: ProcessAirport;
  readonly retry: RetryPolicy;
  readonly progress: ProgressReporter;
  readonly report: RunReport;
  readonly audit: ChartTypeAudit;
  readonly clock: Clock;
  readonly options: CrawlerOptions;
}

/**
 * Cuida da varredura — paginação e concorrência. Um aeródromo é assunto de
 * `ProcessAirport`; essa divisão é o que mantém a responsabilidade única e faz
 * a política de tentativas envolver o caso de uso inteiro sem que ele saiba.
 */
export class DeceaCrawlerJob implements Job {
  readonly name = "decea-crawler";
  readonly description = "Coleta aeródromos, cartas IFR e documentos do DECEA";

  private readonly client: AisWebClient;
  private readonly processAirport: ProcessAirport;
  private readonly retry: RetryPolicy;
  private readonly progress: ProgressReporter;
  private readonly report: RunReport;
  private readonly audit: ChartTypeAudit;
  private readonly clock: Clock;
  private readonly options: CrawlerOptions;

  constructor(options: DeceaCrawlerJobOptions) {
    this.client = options.client;
    this.processAirport = options.processAirport;
    this.retry = options.retry;
    this.progress = options.progress;
    this.report = options.report;
    this.audit = options.audit;
    this.clock = options.clock;
    this.options = options.options;
  }

  async run(signal: AbortSignal): Promise<RunReport> {
    if (this.options.only.length > 0) {
      await this.runRestricted(signal);
      return this.report;
    }

    const total = await this.client.countAirports();
    const pages = totalPages(total, this.options.pageSize);
    this.progress.jobStarted(total, pages, this.options.concurrency);

    for (let page = 1; page <= pages; page += 1) {
      if (signal.aborted) {
        this.progress.interrupted();
        break;
      }

      this.progress.pageStarted(page, pages);
      const startedAt = this.clock.now();

      const icaos = await this.client.listAirportIcaos(
        pageOffset(page, this.options.pageSize),
        this.options.pageSize,
      );
      // Página vazia encerra a varredura mesmo com `total` sugerindo mais —
      // protege contra catálogo que muda durante a execução (contrato op. 1).
      if (icaos.length === 0) {
        break;
      }

      await this.processPage(icaos, signal);
      this.progress.pageFinished(page, pages, this.clock.now().getTime() - startedAt.getTime());
    }

    this.reportUnknownTypes();
    return this.report;
  }

  private async runRestricted(signal: AbortSignal): Promise<void> {
    const icaos = this.options.only;
    this.progress.jobStarted(icaos.length, 1, this.options.concurrency);
    this.progress.pageStarted(1, 1);
    const startedAt = this.clock.now();

    await this.processPage(icaos, signal);

    this.progress.pageFinished(1, 1, this.clock.now().getTime() - startedAt.getTime());
    this.reportUnknownTypes();
  }

  /** `p-limit` mantém no máximo `concurrency` aeródromos em voo (FR-023). */
  private async processPage(icaos: readonly string[], signal: AbortSignal): Promise<void> {
    const limit = pLimit(this.options.concurrency);
    let announcedInterruption = false;

    await Promise.all(
      icaos.map((icao) =>
        limit(async () => {
          if (signal.aborted) {
            // Nenhum aeródromo novo é iniciado; os em curso terminam (FR-028).
            if (!announcedInterruption) {
              announcedInterruption = true;
              this.progress.interrupted();
            }
            return;
          }
          await this.processOne(icao, signal);
        }),
      ),
    );
  }

  private async processOne(icao: string, signal: AbortSignal): Promise<void> {
    try {
      const outcome = await this.retry.execute(() => this.processAirport.execute(icao, signal), {
        signal,
        onRetry: (attempt, maxAttempts, error) => {
          this.progress.airportRetrying(icao, attempt, maxAttempts, describe(error));
        },
      });
      this.report.recordSuccess(outcome);
      this.progress.airportSucceeded(icao, outcome.name, outcome.proceduresPersisted);
    } catch (error) {
      if (signal.aborted) {
        // Interrupção não é falha do aeródromo: a reexecução refaz o pendente.
        return;
      }
      const reason = describe(error);
      this.report.recordFailure(icao, reason);
      this.progress.airportFailed(icao, reason);
    }
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
