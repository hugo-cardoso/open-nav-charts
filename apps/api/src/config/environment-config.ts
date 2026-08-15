import { z } from "zod";

/** Configuração ausente ou inválida — o servidor nem sobe (FR-034). */
export class InvalidConfigurationError extends Error {
  override readonly name = "InvalidConfigurationError";
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

export interface ServerSettings {
  readonly port: number;
  readonly logLevel: LogLevel;
}

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

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
  API_PORT: z
    .string()
    .trim()
    .default("3000")
    .refine(
      (value) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535;
      },
      { message: "API_PORT deve ser um inteiro entre 1 e 65535" },
    )
    .transform(Number),
  API_LOG_LEVEL: z
    .string()
    .trim()
    .default("info")
    .refine((value): value is LogLevel => (LOG_LEVELS as readonly string[]).includes(value), {
      message: `API_LOG_LEVEL deve ser um de: ${LOG_LEVELS.join(", ")}`,
    }),
});

/**
 * Lida e validada na inicialização, antes de abrir a porta. Todas as ausências
 * são reportadas de uma vez — descobrir uma variável faltante por reinício é o
 * ciclo que FR-034 existe para evitar. Nenhum valor entra na mensagem: eles
 * podem ser credencial.
 */
export class EnvironmentConfig {
  readonly database: DatabaseSettings;
  readonly storage: StorageSettings;
  readonly server: ServerSettings;

  private constructor(input: z.infer<typeof schema>) {
    this.database = { url: input.DATABASE_URL };
    this.storage = {
      endpoint: input.S3_ENDPOINT,
      region: input.S3_REGION,
      accessKeyId: input.S3_ACCESS_KEY_ID,
      secretAccessKey: input.S3_SECRET_ACCESS_KEY,
      bucket: input.S3_BUCKET,
      forcePathStyle: input.S3_FORCE_PATH_STYLE,
    };
    this.server = { port: input.API_PORT, logLevel: input.API_LOG_LEVEL };
  }

  static fromEnvironment(
    environment: Readonly<Record<string, string | undefined>>,
  ): EnvironmentConfig {
    const parsed = schema.safeParse(environment);
    if (parsed.success) {
      return new EnvironmentConfig(parsed.data);
    }

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
