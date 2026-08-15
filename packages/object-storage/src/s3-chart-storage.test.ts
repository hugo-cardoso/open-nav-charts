import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3ChartStorage } from "./s3-chart-storage.js";

/** O S3Client não é exercitado aqui: `buildKey` é pura e não toca a rede. */
function storage(): S3ChartStorage {
  return new S3ChartStorage({
    client: {} as S3Client,
    bucket: "onc-charts",
  });
}

/**
 * Cliente com credenciais fictícias. A assinatura é calculada localmente, então
 * nada é enviado ao endpoint — nenhum destes testes acessa a rede (research R12).
 */
function signingStorage(): S3ChartStorage {
  return new S3ChartStorage({
    client: new S3Client({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
    }),
    bucket: "onc-charts",
  });
}

describe("S3ChartStorage.buildKey", () => {
  it("monta a chave como <ICAO>/<id>.pdf", () => {
    expect(storage().buildKey("SBGL", "abc123")).toBe("SBGL/abc123.pdf");
  });

  it("normaliza o ICAO para maiúsculo", () => {
    expect(storage().buildKey("sbgl", "abc123")).toBe("SBGL/abc123.pdf");
  });

  it("preserva o identificador da carta como a fonte o publica", () => {
    const id = "e0d1c9f2-6564-4465-8f57eb1708fa53f1";

    expect(storage().buildKey("SBGL", id)).toBe(`SBGL/${id}.pdf`);
  });

  it("é determinística: a mesma carta sempre produz a mesma chave", () => {
    const first = storage().buildKey("SBGL", "abc123");
    const second = storage().buildKey("SBGL", "abc123");

    expect(first).toBe(second);
  });
});

describe("S3ChartStorage.presignGetUrl", () => {
  it("aponta para o endpoint configurado, com bucket e chave no caminho", async () => {
    const signed = await signingStorage().presignGetUrl("SBGL/abc123.pdf", 300);
    const url = new URL(signed);

    expect(url.origin).toBe("http://localhost:9000");
    expect(url.pathname).toBe("/onc-charts/SBGL/abc123.pdf");
  });

  it("assina com SigV4 e declara a validade recebida", async () => {
    const signed = await signingStorage().presignGetUrl("SBGL/abc123.pdf", 300);
    const params = new URL(signed).searchParams;

    expect(params.get("X-Amz-Signature")).toMatch(/^[0-9a-f]+$/);
    expect(params.get("X-Amz-Expires")).toBe("300");
    expect(params.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(params.get("X-Amz-Credential")).toContain("minioadmin");
  });

  it("respeita uma validade diferente", async () => {
    const signed = await signingStorage().presignGetUrl("SBGL/abc123.pdf", 60);

    expect(new URL(signed).searchParams.get("X-Amz-Expires")).toBe("60");
  });

  it("escapa a chave no caminho da URL", async () => {
    const signed = await signingStorage().presignGetUrl("SBGL/carta com espaço.pdf", 300);

    expect(signed).toContain("carta%20com%20espa%C3%A7o.pdf");
  });

  it("não expõe a chave secreta na URL", async () => {
    const signed = await signingStorage().presignGetUrl("SBGL/abc123.pdf", 300);

    // O access key id é público e vai no `X-Amz-Credential`; a secret nunca.
    expect(signed).not.toContain("X-Amz-Secret");
  });
});
