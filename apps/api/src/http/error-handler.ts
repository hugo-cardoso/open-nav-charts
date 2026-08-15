import type { ErrorRequestHandler, Request, Response } from "express";
import type { Logger } from "../observability/logger.js";
import { ApiError, type ErrorCode } from "./api-error.js";

export interface ErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
  };
}

export function errorBody(code: ErrorCode, message: string): ErrorBody {
  return { error: { code, message } };
}

/**
 * Único ponto que converte exceção em resposta. Concentrar aqui é o que garante
 * que nenhuma rota vaze rastreamento de pilha, SQL ou nome de recurso de
 * infraestrutura (FR-026, FR-035, SC-009): o que não é `ApiError` vira `500`
 * com corpo genérico, e o detalhe real só existe no log do servidor.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request: Request, response: Response, next): void => {
    if (response.headersSent) {
      // Resposta já iniciada: só o Express sabe encerrar a conexão daqui.
      next(error);
      return;
    }

    if (error instanceof ApiError) {
      logger.warn("requisição recusada", {
        method: request.method,
        route: request.originalUrl,
        status: error.status,
        code: error.code,
      });
      response.status(error.status).json(errorBody(error.code, error.message));
      return;
    }

    logger.error("falha não prevista", {
      method: request.method,
      route: request.originalUrl,
      reason: error instanceof Error ? error.message : String(error),
    });
    response
      .status(500)
      .json(errorBody("INTERNAL_ERROR", "Erro interno. Tente novamente mais tarde."));
  };
}
