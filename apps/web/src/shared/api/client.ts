import type { ApiErrorBody } from "../../shared/api/types.js";
import { type ApiFailure, toApiFailure } from "../../shared/errors/error-messages.js";

/**
 * Cliente HTTP da API. Somente leitura e sem credenciais: a API responde
 * `Access-Control-Allow-Origin: *` e recusa qualquer método além de `GET`.
 *
 * Toda falha — de resposta, de rede ou de corpo malformado — sai daqui como
 * `ApiFailure`, para que a interface nunca precise interpretar `Response` crua
 * nem exibir a `message` em português vinda da API (FR-024).
 */

/** Erro lançado pelas funções de acesso; carrega a falha normalizada. */
export class ApiRequestError extends Error {
  override readonly name = "ApiRequestError";
  readonly failure: ApiFailure;

  constructor(failure: ApiFailure) {
    super(`Falha na requisição à API: ${failure.code}`);
    this.failure = failure;
  }
}

export type QueryValue = string | number | null | undefined;

export interface RequestOptions {
  readonly baseUrl: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly signal?: AbortSignal;
}

/**
 * Parâmetros nulos, indefinidos ou vazios são omitidos — enviar `search=` vazio
 * seria recusado pela API com `400 INVALID_SEARCH`
 * (contracts/api-client.md §"Operações consumidas").
 */
export function buildUrl(
  baseUrl: string,
  path: string,
  query: Readonly<Record<string, QueryValue>> = {},
): string {
  const url = new URL(`${baseUrl}${path}`);

  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) {
      continue;
    }
    const asString = String(value).trim();
    if (asString === "") {
      continue;
    }
    url.searchParams.set(key, asString);
  }

  return url.toString();
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = (value as { error?: unknown }).error;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { code?: unknown }).code === "string"
  );
}

/**
 * Uma resposta de erro sem o envelope esperado vira `UNEXPECTED_RESPONSE` em vez
 * de quebrar: a interface prefere uma mensagem genérica a uma exceção.
 */
async function failureFromResponse(response: Response): Promise<ApiFailure> {
  try {
    const body: unknown = await response.json();
    if (isApiErrorBody(body)) {
      return toApiFailure(body.error.code, response.status);
    }
  } catch {
    // Corpo ausente ou não-JSON: tratado abaixo como resposta inesperada.
  }
  return toApiFailure("UNEXPECTED_RESPONSE", response.status);
}

export async function requestJson<T>(options: RequestOptions): Promise<T> {
  const url = buildUrl(options.baseUrl, options.path, options.query);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      // Leitura pública: nenhuma credencial atravessa a fronteira de origem.
      credentials: "omit",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    // `AbortError` é cancelamento deliberado (ex.: nova digitação), não falha
    // a ser exibida — repassa para o chamador descartar silenciosamente.
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiRequestError(toApiFailure("NETWORK_ERROR", null));
  }

  if (!response.ok) {
    throw new ApiRequestError(await failureFromResponse(response));
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiRequestError(toApiFailure("UNEXPECTED_RESPONSE", response.status));
  }
}

/** Extrai a falha normalizada de um erro qualquer, para uso na camada de UI. */
export function toFailure(error: unknown): ApiFailure {
  if (error instanceof ApiRequestError) {
    return error.failure;
  }
  return toApiFailure("INTERNAL_ERROR", null);
}
