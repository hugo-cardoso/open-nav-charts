import { describe, expect, it } from "vitest";
import { EnvironmentConfig, InvalidConfigurationError } from "./environment-config.js";

const complete = {
  AISWEB_API_KEY: "chave",
  AISWEB_API_PASS: "senha",
  DATABASE_URL: "postgres://onc:onc@localhost:5432/onc",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: "onc-charts",
  S3_FORCE_PATH_STYLE: "true",
} as const;

describe("EnvironmentConfig", () => {
  it("lê as 9 variáveis do ambiente", () => {
    const config = EnvironmentConfig.fromEnvironment(complete);

    expect(config.aisWeb).toEqual({ apiKey: "chave", apiPass: "senha" });
    expect(config.database).toEqual({ url: "postgres://onc:onc@localhost:5432/onc" });
    expect(config.storage).toEqual({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
      bucket: "onc-charts",
      forcePathStyle: true,
    });
  });

  it("lista TODAS as variáveis ausentes de uma vez", () => {
    let thrown: unknown;
    try {
      EnvironmentConfig.fromEnvironment({});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidConfigurationError);
    const message = (thrown as Error).message;
    for (const name of Object.keys(complete)) {
      expect(message).toContain(name);
    }
  });

  it("identifica exatamente a variável faltante quando é uma só", () => {
    const { S3_BUCKET, ...incomplete } = complete;
    void S3_BUCKET;

    expect(() => EnvironmentConfig.fromEnvironment(incomplete)).toThrow(/S3_BUCKET/);
    expect(() => EnvironmentConfig.fromEnvironment(incomplete)).toThrow(InvalidConfigurationError);
  });

  it("rejeita variável presente mas vazia", () => {
    expect(() => EnvironmentConfig.fromEnvironment({ ...complete, AISWEB_API_KEY: "" })).toThrow(
      /AISWEB_API_KEY/,
    );
  });

  it("rejeita DATABASE_URL que não é uma URL", () => {
    expect(() =>
      EnvironmentConfig.fromEnvironment({ ...complete, DATABASE_URL: "nao é url" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("interpreta S3_FORCE_PATH_STYLE=false como falso", () => {
    const config = EnvironmentConfig.fromEnvironment({
      ...complete,
      S3_FORCE_PATH_STYLE: "false",
    });

    expect(config.storage.forcePathStyle).toBe(false);
  });

  it("rejeita S3_FORCE_PATH_STYLE com valor não booleano", () => {
    expect(() =>
      EnvironmentConfig.fromEnvironment({ ...complete, S3_FORCE_PATH_STYLE: "talvez" }),
    ).toThrow(/S3_FORCE_PATH_STYLE/);
  });

  it("nunca expõe segredos na mensagem de erro", () => {
    let thrown: unknown;
    try {
      EnvironmentConfig.fromEnvironment({ ...complete, S3_BUCKET: "" });
    } catch (error) {
      thrown = error;
    }

    const message = (thrown as Error).message;
    expect(message).not.toContain("senha");
    expect(message).not.toContain("minioadmin");
  });
});
