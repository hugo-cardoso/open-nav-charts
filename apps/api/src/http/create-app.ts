import cors from "cors";
import express, { type Express, type Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Logger } from "../observability/logger.js";
import { MethodNotAllowedError, RouteNotFoundError } from "./api-error.js";
import { createErrorHandler, errorBody } from "./error-handler.js";
import { createRequestLogger } from "./request-logger.js";

/** Janela e limite de FR-030. */
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 120;

export interface CreateAppOptions {
  readonly logger: Logger;
  /** Rotas de recurso, montadas sob `/v1`. */
  readonly airports: Router;
  readonly procedures: Router;
  /** Rotas operacionais, sem prefixo de versão. */
  readonly health: Router;
  readonly docs: Router;
  /** Desligado nos testes que não exercitam o limite. */
  readonly rateLimitMax?: number;
}

/**
 * Monta a aplicação Express. A ordem dos middlewares é o contrato: borda,
 * limitação, log, rotas, e o tratador de erro por último — só assim toda falha,
 * inclusive a de rota inexistente, sai no mesmo envelope (FR-026).
 */
export function createApp(options: CreateAppOptions): Express {
  const app = express();

  // `trust proxy` mantém o IP real por trás de um proxy reverso: sem isso a
  // limitação de taxa contaria todo o tráfego como um único cliente.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: "*", methods: ["GET"] }));
  app.use(createRequestLogger({ logger: options.logger }));

  // `/health` fica fora do limite para que a verificação de saúde não seja
  // bloqueada por tráfego de consumidores (FR-030).
  app.use("/health", options.health);
  app.use("/docs", options.docs);

  app.use(
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      limit: options.rateLimitMax ?? RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_request, response) => {
        const retryAfterSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
        response
          .status(429)
          .setHeader("Retry-After", String(retryAfterSeconds))
          .json(
            errorBody(
              "RATE_LIMITED",
              `Limite de requisições excedido. Tente novamente em ${retryAfterSeconds} segundos.`,
            ),
          );
      },
    }),
  );

  const v1 = express.Router();
  v1.use(options.airports);
  v1.use(options.procedures);
  app.use("/v1", v1);

  // Somente leitura (FR-025): qualquer método além de GET é recusado antes de
  // virar "rota não encontrada", para o consumidor saber o que corrigir.
  app.use((request, _response, next) => {
    next(
      request.method === "GET" || request.method === "HEAD"
        ? new RouteNotFoundError(`Rota não encontrada: ${request.method} ${request.path}`)
        : new MethodNotAllowedError(),
    );
  });

  app.use(createErrorHandler(options.logger));

  return app;
}
