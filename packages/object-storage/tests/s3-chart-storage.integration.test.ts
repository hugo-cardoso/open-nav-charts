import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createChartStorage,
  InvalidPdfContentError,
  type ManagedChartStorage,
} from "../src/index.js";

const BUCKET = "onc-charts";
const ACCESS_KEY = "minioadmin";
const SECRET_KEY = "minioadmin";

function pdf(content = "%PDF-1.7\nconteúdo de teste\n%%EOF"): Uint8Array {
  return new TextEncoder().encode(content);
}

/**
 * Integração contra MinIO efêmero: valida `forcePathStyle` e as chamadas reais
 * do SDK, que dublês nunca exercitam (research R6, R9).
 */
describe("S3ChartStorage (integração)", () => {
  let container: StartedTestContainer;
  let storage: ManagedChartStorage;

  beforeAll(async () => {
    container = await new GenericContainer("minio/minio:latest")
      .withCommand(["server", "/data"])
      .withEnvironment({
        MINIO_ROOT_USER: ACCESS_KEY,
        MINIO_ROOT_PASSWORD: SECRET_KEY,
      })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
      .start();

    const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;

    // O bucket é criado uma vez, como o docker-compose faz no ambiente local.
    const admin = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    });
    await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));
    admin.destroy();

    storage = createChartStorage({
      endpoint,
      region: "us-east-1",
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      bucket: BUCKET,
      forcePathStyle: true,
    });
  }, 120_000);

  afterAll(async () => {
    storage?.close();
    await container?.stop();
  });

  it("monta a chave como <ICAO>/<id>.pdf", () => {
    expect(storage.buildKey("sbgl", "abc123")).toBe("SBGL/abc123.pdf");
  });

  it("grava, confirma a existência e remove o objeto", async () => {
    const key = storage.buildKey("SBGL", "ciclo");

    expect(await storage.exists(key)).toBe(false);

    await storage.put(key, pdf());
    expect(await storage.exists(key)).toBe(true);

    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it("é idempotente: gravar duas vezes sobrescreve o mesmo objeto", async () => {
    const key = storage.buildKey("SBGL", "idempotente");

    await storage.put(key, pdf("%PDF-1.4 primeira"));
    await storage.put(key, pdf("%PDF-1.4 segunda"));

    expect(await storage.exists(key)).toBe(true);
    await storage.delete(key);
  });

  it("rejeita conteúdo que não é PDF antes de enviar", async () => {
    const key = storage.buildKey("SBGL", "invalido");

    await expect(
      storage.put(key, new TextEncoder().encode("<html>erro</html>")),
    ).rejects.toBeInstanceOf(InvalidPdfContentError);

    expect(await storage.exists(key)).toBe(false);
  });

  it("rejeita conteúdo vazio", async () => {
    const key = storage.buildKey("SBGL", "vazio");

    await expect(storage.put(key, new Uint8Array())).rejects.toBeInstanceOf(InvalidPdfContentError);
    expect(await storage.exists(key)).toBe(false);
  });

  it("apagar objeto inexistente não falha", async () => {
    await expect(
      storage.delete(storage.buildKey("SBGL", "nunca-existiu")),
    ).resolves.toBeUndefined();
  });
});
