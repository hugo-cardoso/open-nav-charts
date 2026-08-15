/**
 * Hierarquia de erro da API. Cada subclasse carrega o código estável e o status
 * HTTP do contrato, para que o middleware de erro converta qualquer uma delas
 * sem conhecer a rota que a lançou (FR-026).
 */

export const ERROR_CODES = [
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

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Base de toda falha que a API sabe descrever. A `message` é destinada ao
 * consumidor humano e nunca contém rastreamento de pilha, SQL ou nome de recurso
 * de infraestrutura (FR-035).
 */
export abstract class ApiError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidIcaoError extends ApiError {
  override readonly code = "INVALID_ICAO";
  override readonly status = 400;

  constructor(message = "O ICAO deve ter exatamente 4 letras.") {
    super(message);
  }
}

export class InvalidProcedureIdError extends ApiError {
  override readonly code = "INVALID_PROCEDURE_ID";
  override readonly status = 400;

  constructor(message = "O identificador do procedimento é inválido.") {
    super(message);
  }
}

export class InvalidPaginationError extends ApiError {
  override readonly code = "INVALID_PAGINATION";
  override readonly status = 400;

  constructor(
    message = "Paginação inválida: page deve ser um inteiro maior ou igual a 1 e pageSize um inteiro entre 1 e 100.",
  ) {
    super(message);
  }
}

export class InvalidStateError extends ApiError {
  override readonly code = "INVALID_STATE";
  override readonly status = 400;

  constructor(message = "A unidade federativa deve ter exatamente 2 letras.") {
    super(message);
  }
}

export class InvalidCountryError extends ApiError {
  override readonly code = "INVALID_COUNTRY";
  override readonly status = 400;

  constructor(message = "O país deve ser um código de 2 letras (ISO 3166-1 alpha-2).") {
    super(message);
  }
}

export class InvalidSearchError extends ApiError {
  override readonly code = "INVALID_SEARCH";
  override readonly status = 400;

  constructor(message = "O termo de busca deve ter de 1 a 100 caracteres.") {
    super(message);
  }
}

export class InvalidProcedureTypeError extends ApiError {
  override readonly code = "INVALID_PROCEDURE_TYPE";
  override readonly status = 400;

  constructor(message = "O tipo do procedimento não pode ser vazio.") {
    super(message);
  }
}

export class AirportNotFoundError extends ApiError {
  override readonly code = "AIRPORT_NOT_FOUND";
  override readonly status = 404;

  constructor(icao: string) {
    super(`Aeródromo ${icao} não encontrado.`);
  }
}

/**
 * Também usado quando o procedimento existe sob outro aeródromo: a resposta é a
 * mesma para não revelar a existência do recurso fora do caminho pedido (FR-021).
 */
export class ProcedureNotFoundError extends ApiError {
  override readonly code = "PROCEDURE_NOT_FOUND";
  override readonly status = 404;

  constructor(message = "Procedimento não encontrado para este aeródromo.") {
    super(message);
  }
}

export class ChartNotAvailableError extends ApiError {
  override readonly code = "CHART_NOT_AVAILABLE";
  override readonly status = 404;

  constructor(message = "Este procedimento não tem documento disponível.") {
    super(message);
  }
}

export class RouteNotFoundError extends ApiError {
  override readonly code = "ROUTE_NOT_FOUND";
  override readonly status = 404;

  constructor(message = "Rota não encontrada.") {
    super(message);
  }
}

export class MethodNotAllowedError extends ApiError {
  override readonly code = "METHOD_NOT_ALLOWED";
  override readonly status = 405;

  constructor(message = "Método não permitido: a API é somente leitura.") {
    super(message);
  }
}

export class RateLimitedError extends ApiError {
  override readonly code = "RATE_LIMITED";
  override readonly status = 429;

  constructor(message = "Limite de requisições excedido. Tente novamente em instantes.") {
    super(message);
  }
}

export class ChartStorageUnavailableError extends ApiError {
  override readonly code = "CHART_STORAGE_UNAVAILABLE";
  override readonly status = 502;

  constructor(message = "Não foi possível preparar o acesso ao documento.") {
    super(message);
  }
}

export class ServiceUnavailableError extends ApiError {
  override readonly code = "SERVICE_UNAVAILABLE";
  override readonly status = 503;

  constructor(message = "Serviço temporariamente indisponível.") {
    super(message);
  }
}

export class InternalError extends ApiError {
  override readonly code = "INTERNAL_ERROR";
  override readonly status = 500;

  constructor(message = "Erro interno.") {
    super(message);
  }
}
