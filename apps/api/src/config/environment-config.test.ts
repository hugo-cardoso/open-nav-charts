import { describe, expect, it } from "vitest";
import { EnvironmentConfig, InvalidConfigurationError } from "./environment-config.js";

const complete = {
  DATABASE_URL: "postgres://onc:onc@localhost:5432/onc",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: "onc-charts",
  S3_FORCE_PATH_STYLE: "true",
  API_PORT: "3000",
  API_LOG_LEVEL: "info",
} as const;

function withEnvironment(overrides: Readonly<Record<string, string | undefined>>) {
  return { ...complete, ...overrides };
}

describe("EnvironmentConfig", () => {
  it("lê o ambiente completo", () => {
    const config = EnvironmentConfig.fromEnvironment(complete);

    expect(config.database.url).toBe("postgres://onc:onc@localhost:5432/onc");
    expect(config.storage.bucket).toBe("onc-charts");
    expect(config.storage.forcePathStyle).toBe(true);
    expect(config.server.port).toBe(3000);
    expect(config.server.logLevel).toBe("info");
  });

  it("não exige as credenciais da AISWEB — a API não as usa", () => {
    expect(() => EnvironmentConfig.fromEnvironment(complete)).not.toThrow();
  });

  it("aplica os padrões de porta e nível de log", () => {
    const config = EnvironmentConfig.fromEnvironment(
      withEnvironment({ API_PORT: undefined, API_LOG_LEVEL: undefined }),
    );

    expect(config.server.port).toBe(3000);
    expect(config.server.logLevel).toBe("info");
  });

  it("prefere PORT a API_PORT — é a porta em que a plataforma verifica a saúde", () => {
    const config = EnvironmentConfig.fromEnvironment(
      withEnvironment({ PORT: "8080", API_PORT: "3000" }),
    );

    expect(config.server.port).toBe(8080);
  });

  it("rejeita PORT inválida em vez de cair silenciosamente em API_PORT", () => {
    expect(() =>
      EnvironmentConfig.fromEnvironment(withEnvironment({ PORT: "não-é-porta" })),
    ).toThrow(InvalidConfigurationError);
  });

  it("reporta todas as ausências de uma vez (FR-034)", () => {
    let message = "";
    try {
      EnvironmentConfig.fromEnvironment(
        withEnvironment({
          DATABASE_URL: undefined,
          S3_BUCKET: undefined,
          S3_SECRET_ACCESS_KEY: undefined,
        }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("S3_BUCKET");
    expect(message).toContain("S3_SECRET_ACCESS_KEY");
  });

  it("lança InvalidConfigurationError quando falta variável", () => {
    expect(() =>
      EnvironmentConfig.fromEnvironment(withEnvironment({ DATABASE_URL: undefined })),
    ).toThrow(InvalidConfigurationError);
  });

  it("nunca ecoa o valor da variável no erro", () => {
    let message = "";
    try {
      EnvironmentConfig.fromEnvironment(
        withEnvironment({
          S3_SECRET_ACCESS_KEY: "   ",
          DATABASE_URL: "isto-nao-e-url",
        }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("S3_SECRET_ACCESS_KEY");
    expect(message).not.toContain("isto-nao-e-url");
    expect(message).not.toContain("minioadmin");
  });

  it("recusa DATABASE_URL que não é URL de conexão", () => {
    expect(() =>
      EnvironmentConfig.fromEnvironment(withEnvironment({ DATABASE_URL: "nao-e-url" })),
    ).toThrow(InvalidConfigurationError);
  });

  it("recusa porta fora da faixa e não numérica", () => {
    for (const port of ["0", "70000", "abc", "3000.5", "-1"]) {
      expect(() => EnvironmentConfig.fromEnvironment(withEnvironment({ API_PORT: port }))).toThrow(
        InvalidConfigurationError,
      );
    }
  });

  it("recusa nível de log desconhecido", () => {
    expect(() =>
      EnvironmentConfig.fromEnvironment(withEnvironment({ API_LOG_LEVEL: "verboso" })),
    ).toThrow(InvalidConfigurationError);
  });

  it("recusa S3_FORCE_PATH_STYLE que não é booleano textual", () => {
    expect(() =>
      EnvironmentConfig.fromEnvironment(withEnvironment({ S3_FORCE_PATH_STYLE: "sim" })),
    ).toThrow(InvalidConfigurationError);
  });
});
