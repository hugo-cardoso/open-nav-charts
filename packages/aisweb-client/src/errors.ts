/**
 * Erros da fonte, classificados conforme a tabela de `contracts/aisweb-api.md`.
 * A distinção é o que a política de tentativas consome para não gastar retries
 * em falhas definitivas.
 */

/** Rede, timeout, 5xx, 429 — vale nova tentativa com backoff. */
export class RetryableSourceError extends Error {
  override readonly name = "RetryableSourceError";
}

/** 4xx (exceto 429), XML malformado, campo obrigatório ausente — não repetir. */
export class PermanentSourceError extends Error {
  override readonly name = "PermanentSourceError";
}

/**
 * 401/403 — credencial rejeitada. Aborta a execução inteira: com credencial
 * inválida todos os aeródromos falhariam igualmente.
 */
export class AuthenticationSourceError extends Error {
  override readonly name = "AuthenticationSourceError";
}

export function isRetryableSourceError(error: unknown): error is RetryableSourceError {
  return error instanceof RetryableSourceError;
}

export function isAuthenticationSourceError(error: unknown): error is AuthenticationSourceError {
  return error instanceof AuthenticationSourceError;
}
