/**
 * Tradução de código de erro em texto para o usuário.
 *
 * A API responde `{ error: { code, message } }`, onde `message` é texto em
 * português do Brasil. Como a interface é em inglês (FR-024), o texto exibido
 * deriva sempre de `code` — a `message` da API nunca chega à tela.
 */

/** Códigos produzidos pela API (`apps/api/src/http/api-error.ts`). */
export const API_ERROR_CODES = [
  "INVALID_ICAO",
  "INVALID_PROCEDURE_ID",
  "INVALID_PAGINATION",
  "INVALID_STATE",
  "INVALID_COUNTRY",
  "INVALID_SEARCH",
  "INVALID_PROCEDURE_TYPE",
  "AIRPORT_NOT_FOUND",
  "PROCEDURE_NOT_FOUND",
  "CHART_NOT_AVAILABLE",
  "ROUTE_NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "RATE_LIMITED",
  "CHART_STORAGE_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

/** Códigos criados pelo cliente; não existem na API. */
export const CLIENT_ERROR_CODES = ["NETWORK_ERROR", "UNEXPECTED_RESPONSE"] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type ErrorCode = ApiErrorCode | ClientErrorCode;

/** Falha normalizada: toda origem de erro converge para esta forma. */
export interface ApiFailure {
  readonly code: ErrorCode;
  /** `null` quando a requisição não chegou a completar. */
  readonly status: number | null;
  /** Repetir a mesma requisição pode ter resultado diferente. */
  readonly retryable: boolean;
}

interface ErrorDescriptor {
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Um erro é repetível quando a causa é transitória. Erros de validação e de
 * recurso inexistente não são: repetir produziria exatamente o mesmo resultado,
 * e oferecer "tentar de novo" ali seria enganoso.
 */
const ERROR_DESCRIPTORS: Readonly<Record<ErrorCode, ErrorDescriptor>> = {
  INVALID_ICAO: {
    message: "Airport codes must be exactly 4 letters.",
    retryable: false,
  },
  INVALID_PROCEDURE_ID: {
    message: "This procedure reference is not valid.",
    retryable: false,
  },
  INVALID_PAGINATION: {
    message: "That page is out of range.",
    retryable: false,
  },
  INVALID_STATE: {
    message: "State codes must be exactly 2 letters.",
    retryable: false,
  },
  INVALID_COUNTRY: {
    message: "Country codes must be exactly 2 letters.",
    retryable: false,
  },
  INVALID_SEARCH: {
    message: "Search terms must be between 1 and 100 characters.",
    retryable: false,
  },
  INVALID_PROCEDURE_TYPE: {
    message: "That procedure type is not valid.",
    retryable: false,
  },
  AIRPORT_NOT_FOUND: {
    message: "We couldn't find that airport.",
    retryable: false,
  },
  PROCEDURE_NOT_FOUND: {
    message: "We couldn't find that procedure.",
    retryable: false,
  },
  CHART_NOT_AVAILABLE: {
    message: "No chart is available for this procedure.",
    retryable: false,
  },
  ROUTE_NOT_FOUND: {
    message: "That address doesn't exist.",
    retryable: false,
  },
  METHOD_NOT_ALLOWED: {
    message: "That action isn't supported.",
    retryable: false,
  },
  RATE_LIMITED: {
    message: "Too many requests. Please wait a moment and try again.",
    retryable: true,
  },
  CHART_STORAGE_UNAVAILABLE: {
    message: "The chart archive is unavailable right now.",
    retryable: true,
  },
  SERVICE_UNAVAILABLE: {
    message: "The service is temporarily unavailable.",
    retryable: true,
  },
  INTERNAL_ERROR: {
    message: "Something went wrong on our side.",
    retryable: true,
  },
  NETWORK_ERROR: {
    message: "We couldn't reach the service. Check your connection.",
    retryable: true,
  },
  UNEXPECTED_RESPONSE: {
    message: "We received an unexpected response.",
    retryable: true,
  },
};

export function isKnownErrorCode(value: string): value is ErrorCode {
  return value in ERROR_DESCRIPTORS;
}

/**
 * Um código desconhecido recai em `INTERNAL_ERROR`: se a API passar a emitir um
 * código novo, a tela mostra uma mensagem genérica em vez de ficar em branco.
 */
export function describeError(code: string): ErrorDescriptor {
  return isKnownErrorCode(code) ? ERROR_DESCRIPTORS[code] : ERROR_DESCRIPTORS.INTERNAL_ERROR;
}

export function errorMessage(code: string): string {
  return describeError(code).message;
}

export function isRetryable(code: string): boolean {
  return describeError(code).retryable;
}

/** Constrói a falha normalizada, resolvendo `retryable` pela tabela. */
export function toApiFailure(code: string, status: number | null): ApiFailure {
  const resolved = isKnownErrorCode(code) ? code : "INTERNAL_ERROR";
  return {
    code: resolved,
    status,
    retryable: ERROR_DESCRIPTORS[resolved].retryable,
  };
}
