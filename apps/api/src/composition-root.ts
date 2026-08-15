import { createDatabase, type Database } from "@open-nav-charts/domain";
import { createChartStorage, type ManagedChartStorage } from "@open-nav-charts/object-storage";
import type { Express } from "express";
import type { EnvironmentConfig } from "./config/environment-config.js";
import { createApp } from "./http/create-app.js";
import { JsonLogger, type Logger } from "./observability/logger.js";
import { createAirportsRouter } from "./routes/airports-router.js";
import { createDocsRouter } from "./routes/docs-router.js";
import { createHealthRouter } from "./routes/health-router.js";
import { createProceduresRouter } from "./routes/procedures-router.js";
import { AirportService } from "./services/airport-service.js";
import { ChartService } from "./services/chart-service.js";
import { ProcedureService } from "./services/procedure-service.js";

export interface CompositionRootOptions {
  readonly config: EnvironmentConfig;
  readonly logger?: Logger;
}

/**
 * Único ponto que instancia classes concretas e monta o grafo (Princípio III).
 * O pool do banco e o cliente S3 nascem e morrem aqui — nenhum singleton de
 * módulo, espelhando `apps/jobs/src/composition-root.ts`.
 */
export class CompositionRoot {
  readonly logger: Logger;
  private readonly config: EnvironmentConfig;
  private database: Database | null = null;
  private storage: ManagedChartStorage | null = null;

  constructor(options: CompositionRootOptions) {
    this.config = options.config;
    this.logger = options.logger ?? new JsonLogger({ level: options.config.server.logLevel });
  }

  buildApp(): Express {
    const database = this.db();
    const storage = this.chartStorage();

    const airports = new AirportService({ repository: database.airports });
    const procedures = new ProcedureService({
      airports: database.airports,
      procedures: database.procedures,
    });
    const charts = new ChartService({
      procedures: database.procedures,
      storage,
      logger: this.logger,
    });

    return createApp({
      logger: this.logger,
      airports: createAirportsRouter({ service: airports }),
      procedures: createProceduresRouter({ procedures, charts }),
      health: createHealthRouter({ ping: () => database.ping(), logger: this.logger }),
      docs: createDocsRouter(),
    });
  }

  private db(): Database {
    this.database ??= createDatabase({
      url: this.config.database.url,
      maxConnections: 10,
      // Conexão ociosa derrubada pelo servidor não pode matar a API: o pool se
      // recupera e `/health` passa a reportar o estado real (FR-029, FR-033).
      onPoolError: (error) => {
        this.logger.warn("conexão ociosa do banco encerrada pelo servidor", {
          reason: error.message,
        });
      },
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
