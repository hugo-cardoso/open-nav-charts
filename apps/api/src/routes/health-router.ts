import { Router } from "express";
import type { Logger } from "../observability/logger.js";

export interface HealthRouterOptions {
  /** Verificação de conectividade do banco; rejeita quando indisponível. */
  readonly ping: () => Promise<void>;
  readonly logger: Logger;
}

export interface HealthResponse {
  readonly status: "ok" | "degraded";
  readonly checks: { readonly database: "ok" | "unavailable" };
}

/**
 * Distingue o processo no ar da dependência quebrada (FR-029). O bucket **não**
 * é verificado: a API nunca lê objetos, só assina URLs localmente, então sua
 * indisponibilidade não impede a API de responder — incluí-lo produziria alarme
 * falso (research R10).
 */
export function createHealthRouter(options: HealthRouterOptions): Router {
  const router = Router();

  router.get("/", async (_request, response) => {
    try {
      await options.ping();
      const body: HealthResponse = { status: "ok", checks: { database: "ok" } };
      response.json(body);
    } catch (error) {
      options.logger.error("verificação de saúde falhou", {
        check: "database",
        reason: error instanceof Error ? error.message : String(error),
      });
      const body: HealthResponse = { status: "degraded", checks: { database: "unavailable" } };
      response.status(503).json(body);
    }
  });

  return router;
}
