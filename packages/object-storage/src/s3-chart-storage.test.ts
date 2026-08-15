import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3ChartStorage } from "./s3-chart-storage.js";

/** O S3Client não é exercitado aqui: `buildKey` é pura e não toca a rede. */
function storage(): S3ChartStorage {
  return new S3ChartStorage({
    client: {} as S3Client,
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
