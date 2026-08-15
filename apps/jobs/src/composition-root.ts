import { HttpAisWebClient } from "@open-nav-charts/aisweb-client";
import { createDatabase, type Database, runMigrations } from "@open-nav-charts/domain";
import { createChartStorage, type ManagedChartStorage } from "@open-nav-charts/object-storage";
import type { EnvironmentConfig } from "./config/environment-config.js";
import { ChartArchiver } from "./jobs/decea-crawler/chart-archiver.js";
import { ChartTypeAudit } from "./jobs/decea-crawler/chart-type-audit.js";
import { type CrawlerOptions, DeceaCrawlerJob } from "./jobs/decea-crawler/decea-crawler-job.js";
import { ProcessAirport } from "./jobs/decea-crawler/process-airport.js";
import { type Clock, SystemClock } from "./runtime/clock.js";
import { JobRegistry } from "./runtime/job-registry.js";
import {
  ConsoleProgressReporter,
  type OutputWriter,
  type ProgressReporter,
} from "./runtime/progress-reporter.js";
import { RetryPolicy } from "./runtime/retry-policy.js";
import { RunReport } from "./runtime/run-report.js";

export interface CrawlerRunOptions extends CrawlerOptions {
  readonly maxAttempts: number;
  readonly skipDocuments: boolean;
}

/**
 * Opções de linha de comando por rotina. Uma rotina nova acrescenta a sua chave
 * aqui; as existentes não são tocadas (FR-003).
 *
 * As chaves são opcionais porque só a rotina invocada recebe opções — as demais
 * são construídas com os seus padrões e nunca chegam a executar.
 */
export interface JobOptionsByName {
  readonly "decea-crawler"?: CrawlerRunOptions;
}

/** Padrões da rotina, aplicados quando ela não é a invocada nesta execução. */
const DEFAULT_CRAWLER_OPTIONS: CrawlerRunOptions = {
  pageSize: 100,
  concurrency: 4,
  maxAttempts: 3,
  skipDocuments: false,
  only: [],
};

export interface CompositionRootOptions {
  readonly config: EnvironmentConfig;
  readonly writer: OutputWriter;
  readonly clock?: Clock;
  readonly fetch?: typeof globalThis.fetch;
  readonly random?: () => number;
}

/**
 * Único ponto que instancia classes concretas e monta o grafo (Princípio III,
 * regra 4). O pool do banco e o cliente S3 nascem e morrem aqui — nenhum
 * singleton de módulo.
 */
export class CompositionRoot {
  private readonly config: EnvironmentConfig;
  private readonly writer: OutputWriter;
  private readonly clock: Clock;
  private readonly fetch: typeof globalThis.fetch;
  private readonly random: () => number;
  private database: Database | null = null;
  private storage: ManagedChartStorage | null = null;

  constructor(options: CompositionRootOptions) {
    this.config = options.config;
    this.writer = options.writer;
    this.clock = options.clock ?? new SystemClock();
    this.fetch = options.fetch ?? globalThis.fetch;
    this.random = options.random ?? Math.random;
  }

  get progress(): ProgressReporter {
    return new ConsoleProgressReporter(this.writer);
  }

  /** Aplica as migrações pendentes sem montar o resto do grafo. */
  async migrate(): Promise<void> {
    await runMigrations({ url: this.config.database.url });
  }

  /**
   * Monta o registro com todas as rotinas conhecidas. `jobOptions` traz as opções
   * de linha de comando indexadas por nome de rotina: cada uma lê a sua e ignora
   * as demais, para acrescentar rotinas não exigir mudar esta assinatura.
   */
  buildRegistry(progress: ProgressReporter, jobOptions: JobOptionsByName): JobRegistry {
    const registry = new JobRegistry();
    registry.register(
      this.buildDeceaCrawler(jobOptions["decea-crawler"] ?? DEFAULT_CRAWLER_OPTIONS, progress),
    );
    return registry;
  }

  private buildDeceaCrawler(
    options: CrawlerRunOptions,
    progress: ProgressReporter,
  ): DeceaCrawlerJob {
    const client = new HttpAisWebClient({
      apiKey: this.config.aisWeb.apiKey,
      apiPass: this.config.aisWeb.apiPass,
      fetch: this.fetch,
    });
    const storage = this.chartStorage();
    const audit = new ChartTypeAudit();
    const report = new RunReport(this.clock.now());

    return new DeceaCrawlerJob({
      client,
      processAirport: new ProcessAirport({
        client,
        repository: this.db().sync,
        archiver: new ChartArchiver({ client, storage }),
        audit,
        report,
        skipDocuments: options.skipDocuments,
      }),
      retry: new RetryPolicy({
        clock: this.clock,
        random: this.random,
        maxAttempts: options.maxAttempts,
        baseDelayMs: 1000,
      }),
      progress,
      report,
      audit,
      clock: this.clock,
      options: {
        pageSize: options.pageSize,
        concurrency: options.concurrency,
        only: options.only,
      },
    });
  }

  private db(): Database {
    this.database ??= createDatabase({
      url: this.config.database.url,
      // Um pouco acima da concorrência de aeródromos, para a transação de um
      // não esperar conexão enquanto outro ainda arquiva documentos.
      maxConnections: 10,
    });
    return this.database;
  }

  private chartStorage(): ManagedChartStorage {
    this.storage ??= createChartStorage({
      endpoint: this.config.storage.endpoint,
      region: this.config.storage.region,
      accessKeyId: this.config.storage.accessKeyId,
      secretAccessKey: this.config.storage.secretAccessKey,
      bucket: this.config.storage.bucket,
      forcePathStyle: this.config.storage.forcePathStyle,
    });
    return this.storage;
  }

  /** Fecha o que foi aberto. Chamado pelo `main` em qualquer desfecho. */
  async close(): Promise<void> {
    this.storage?.close();
    this.storage = null;
    const database = this.database;
    this.database = null;
    await database?.close();
  }
}
