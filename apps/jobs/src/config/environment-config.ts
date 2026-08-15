import { z } from "zod";

/** Configuração ausente ou inválida — a rotina nem começa (código de saída 2). */
export class InvalidConfigurationError extends Error {
  override readonly name = "InvalidConfigurationError";
}

export interface AisWebCredentials {
  readonly apiKey: string;
  readonly apiPass: string;
}

export interface DatabaseSettings {
  readonly url: string;
}

export interface StorageSettings {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly forcePathStyle: boolean;
}

const required = (name: string) => z.string().trim().min(1, `${name} é obrigatória`);

const booleanFromString = (name: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "true" || value === "false", {
      message: `${name} deve ser "true" ou "false"`,
    })
    .transform((value) => value === "true");

const schema = z.object({
  AISWEB_API_KEY: required("AISWEB_API_KEY"),
  AISWEB_API_PASS: required("AISWEB_API_PASS"),
  DATABASE_URL: required("DATABASE_URL").refine((value) => URL.canParse(value), {
    message: "DATABASE_URL deve ser uma URL de conexão válida",
  }),
  S3_ENDPOINT: required("S3_ENDPOINT").refine((value) => URL.canParse(value), {
    message: "S3_ENDPOINT deve ser uma URL válida",
  }),
  S3_REGION: required("S3_REGION"),
  S3_ACCESS_KEY_ID: required("S3_ACCESS_KEY_ID"),
  S3_SECRET_ACCESS_KEY: required("S3_SECRET_ACCESS_KEY"),
  S3_BUCKET: required("S3_BUCKET"),
  S3_FORCE_PATH_STYLE: booleanFromString("S3_FORCE_PATH_STYLE"),
});

/**
 * Lida e validada na inicialização, antes de qualquer coleta (FR-004, FR-005).
 * Todas as ausências são reportadas de uma vez — descobrir uma variável faltante
 * por execução é o ciclo que o FR-005 existe para evitar.
 */
export class EnvironmentConfig {
  readonly aisWeb: AisWebCredentials;
  readonly database: DatabaseSettings;
  readonly storage: StorageSettings;

  private constructor(input: z.infer<typeof schema>) {
    this.aisWeb = { apiKey: input.AISWEB_API_KEY, apiPass: input.AISWEB_API_PASS };
    this.database = { url: input.DATABASE_URL };
    this.storage = {
      endpoint: input.S3_ENDPOINT,
      region: input.S3_REGION,
      accessKeyId: input.S3_ACCESS_KEY_ID,
      secretAccessKey: input.S3_SECRET_ACCESS_KEY,
      bucket: input.S3_BUCKET,
      forcePathStyle: input.S3_FORCE_PATH_STYLE,
    };
  }

  static fromEnvironment(
    environment: Readonly<Record<string, string | undefined>>,
  ): EnvironmentConfig {
    const parsed = schema.safeParse(environment);
    if (parsed.success) {
      return new EnvironmentConfig(parsed.data);
    }

    // Só o nome da variável e o motivo entram na mensagem — nunca o valor, que
    // pode ser credencial.
    const problems = parsed.error.issues.map((issue) => {
      const name = String(issue.path[0] ?? "variável desconhecida");
      const reason = issue.code === "invalid_type" ? "ausente" : issue.message;
      return `  - ${name}: ${reason}`;
    });

    throw new InvalidConfigurationError(
      `Configuração inválida. Corrija as variáveis de ambiente abaixo (ver .env.example):\n${problems.join("\n")}`,
    );
  }
}
