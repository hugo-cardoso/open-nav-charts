import type { RequestHandler } from "express";
import type { Logger } from "../observability/logger.js";

export interface RequestLoggerOptions {
  readonly logger: Logger;
  /** Injetado para o teste medir duração sem depender do relógio real. */
  readonly now?: () => number;
}

/**
 * Uma linha por requisição concluída, com rota, status e duração (FR-031). O
 * registro sai em `finish`, quando o status já é definitivo — inclusive o que o
 * middleware de erro definiu.
 */
export function createRequestLogger(options: RequestLoggerOptions): RequestHandler {
  const now = options.now ?? (() => Date.now());

  return (request, response, next) => {
    const startedAt = now();

    response.once("finish", () => {
      options.logger.info("requisição concluída", {
        method: request.method,
        route: request.originalUrl,
        status: response.statusCode,
        durationMs: now() - startedAt,
      });
    });

    next();
  };
}
