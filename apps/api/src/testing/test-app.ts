import type { Airport, AirportProcedure } from "@open-nav-charts/domain";
import type { Express } from "express";
import { createApp } from "../http/create-app.js";
import { type Logger, NullLogger } from "../observability/logger.js";
import { createAirportsRouter } from "../routes/airports-router.js";
import { createDocsRouter } from "../routes/docs-router.js";
import { createHealthRouter } from "../routes/health-router.js";
import { createProceduresRouter } from "../routes/procedures-router.js";
import { AirportService } from "../services/airport-service.js";
import { ChartService } from "../services/chart-service.js";
import { ProcedureService } from "../services/procedure-service.js";
import {
  FakeAirportProcedureRepository,
  FakeAirportRepository,
  FakeChartStorage,
  FakeHealthProbe,
} from "./doubles.js";

export interface TestAppOptions {
  readonly airports?: readonly Airport[];
  readonly procedures?: readonly AirportProcedure[];
  readonly airportRepository?: FakeAirportRepository;
  readonly storage?: FakeChartStorage;
  readonly health?: FakeHealthProbe;
  readonly logger?: Logger;
  /** Limite de requisições da janela; o padrão é alto para não interferir. */
  readonly rateLimitMax?: number;
}

export interface TestApp {
  readonly app: Express;
  readonly storage: FakeChartStorage;
  readonly health: FakeHealthProbe;
  readonly airportRepository: FakeAirportRepository;
}

/**
 * Monta a aplicação real sobre dublês em memória: os testes de contrato
 * exercitam middlewares, rotas e tratamento de erro sem banco nem rede
 * (research R12).
 */
export function createTestApp(options: TestAppOptions = {}): TestApp {
  const airportRepository =
    options.airportRepository ?? new FakeAirportRepository(options.airports ?? []);
  const procedureRepository = new FakeAirportProcedureRepository(options.procedures ?? []);
  const storage = options.storage ?? new FakeChartStorage();
  const health = options.health ?? new FakeHealthProbe();
  const logger = options.logger ?? new NullLogger();

  const app = createApp({
    logger,
    airports: createAirportsRouter({
      service: new AirportService({ repository: airportRepository }),
    }),
    procedures: createProceduresRouter({
      procedures: new ProcedureService({
        airports: airportRepository,
        procedures: procedureRepository,
      }),
      charts: new ChartService({ procedures: procedureRepository, storage, logger }),
    }),
    health: createHealthRouter({ ping: health.ping, logger }),
    docs: createDocsRouter(),
    rateLimitMax: options.rateLimitMax ?? 10_000,
  });

  return { app, storage, health, airportRepository };
}
