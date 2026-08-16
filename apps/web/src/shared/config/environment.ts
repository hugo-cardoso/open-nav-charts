/**
 * Configuração lida do ambiente de build. Vite substitui `import.meta.env` no
 * momento da compilação, então um valor ausente vira `undefined` no pacote final
 * e não um erro em tempo de execução — daí a validação explícita aqui.
 */

export class InvalidConfigurationError extends Error {
  override readonly name = "InvalidConfigurationError";
}

export interface Environment {
  readonly apiBaseUrl: string;
}

/**
 * Remove a barra final para que a composição de caminhos nunca produza `//`,
 * que alguns servidores tratam como rota distinta.
 */
function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function readEnvironment(source: ImportMetaEnv): Environment {
  const raw = source.VITE_API_BASE_URL;

  if (typeof raw !== "string" || raw.trim() === "") {
    throw new InvalidConfigurationError(
      "VITE_API_BASE_URL é obrigatória. Copie apps/web/.env.example para apps/web/.env.",
    );
  }

  const trimmed = raw.trim();
  if (!URL.canParse(trimmed)) {
    throw new InvalidConfigurationError(
      `VITE_API_BASE_URL deve ser uma URL válida; recebido: ${trimmed}`,
    );
  }

  return { apiBaseUrl: normalizeBaseUrl(trimmed) };
}

export const environment = readEnvironment(import.meta.env);
