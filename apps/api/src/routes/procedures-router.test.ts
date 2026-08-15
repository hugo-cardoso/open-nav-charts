import request from "supertest";
import { describe, expect, it } from "vitest";
import { RecordingLogger } from "../observability/logger.js";
import { airport, archivedProcedure, FakeChartStorage, procedure } from "../testing/doubles.js";
import { createTestApp } from "../testing/test-app.js";

const airports = [airport({ icao: "SBGL" }), airport({ icao: "SBSP" })];

const procedures = [
  archivedProcedure({ id: "p1", airportIcao: "SBGL", name: "IAC ILS RWY 10", type: "IAC" }),
  procedure({ id: "p2", airportIcao: "SBGL", name: "SID DEKON 1A", type: "SID" }),
  archivedProcedure({ id: "p3", airportIcao: "SBGL", name: "STAR MUKIL 1B", type: "STAR" }),
  archivedProcedure({ id: "p9", airportIcao: "SBSP", name: "IAC ILS RWY 17R", type: "IAC" }),
];

describe("GET /v1/airports/:icao/procedures", () => {
  it("devolve a relação com hasChart derivado", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBGL/procedures");

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(3);
    expect(response.body.items).toEqual([
      { id: "p1", name: "IAC ILS RWY 10", type: "IAC", amendment: null, hasChart: true },
      { id: "p2", name: "SID DEKON 1A", type: "SID", amendment: null, hasChart: false },
      { id: "p3", name: "STAR MUKIL 1B", type: "STAR", amendment: null, hasChart: true },
    ]);
  });

  it("não expõe storageKey, sourceUrl nem archivedAt (FR-017)", async () => {
    const { app } = createTestApp({
      airports,
      procedures: [
        archivedProcedure({
          id: "p1",
          airportIcao: "SBGL",
          sourceUrl: "https://aisweb.example/carta.pdf",
        }),
      ],
    });

    const response = await request(app).get("/v1/airports/SBGL/procedures");
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("sourceUrl");
    expect(serialized).not.toContain("archivedAt");
    expect(serialized).not.toContain("aisweb.example");
    expect(serialized).not.toContain(".pdf");
  });

  it("aeródromo existente sem procedimentos devolve items vazio com 200 (FR-016)", async () => {
    const { app } = createTestApp({ airports: [airport({ icao: "SBBR" })], procedures });

    const response = await request(app).get("/v1/airports/SBBR/procedures");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], total: 0 });
  });

  it("aeródromo inexistente devolve 404 AIRPORT_NOT_FOUND", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBXX/procedures");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("AIRPORT_NOT_FOUND");
  });

  it("filtra por tipo, insensível a caixa (FR-015)", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBGL/procedures?type=iac");

    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual(["p1"]);
    expect(response.body.total).toBe(1);
  });

  it("recusa tipo vazio com 400 INVALID_PROCEDURE_TYPE", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBGL/procedures?type=");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PROCEDURE_TYPE");
  });

  it("recusa ICAO malformado com 400 INVALID_ICAO", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/XX/procedures");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ICAO");
  });
});

describe("GET /v1/airports/:icao/procedures/:id/chart", () => {
  it("responde 302 com Location assinado e Cache-Control no-store (FR-019, FR-024)", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBGL/procedures/p1/chart");

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("SBGL/p1.pdf");
    expect(response.headers.location).toContain("X-Amz-Signature");
    expect(response.headers.location).toContain("X-Amz-Expires=300");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("não devolve os bytes do PDF: nenhum documento atravessa a aplicação (SC-004)", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBGL/procedures/p1/chart");

    // O `redirect` do Express emite um corpo textual curto com o destino; o que
    // importa é que nenhum PDF passe por aqui.
    expect(response.text ?? "").not.toContain("%PDF-");
    expect(Number(response.headers["content-length"] ?? 0)).toBeLessThan(512);
  });

  it("aceita ICAO em minúsculas", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/sbgl/procedures/p1/chart");

    expect(response.status).toBe(302);
  });

  it("procedimento inexistente devolve 404 PROCEDURE_NOT_FOUND", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBGL/procedures/nao-existe/chart");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PROCEDURE_NOT_FOUND");
  });

  it("procedimento de outro aeródromo devolve 404 PROCEDURE_NOT_FOUND, sem revelar o ICAO real (FR-021)", async () => {
    const { app, storage } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBSP/procedures/p1/chart");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PROCEDURE_NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("SBGL");
    expect(storage.presignedKeys).toEqual([]);
  });

  it("procedimento sem documento devolve 404 CHART_NOT_AVAILABLE (FR-022)", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBGL/procedures/p2/chart");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("CHART_NOT_AVAILABLE");
  });

  it("falha na assinatura devolve 502 CHART_STORAGE_UNAVAILABLE (FR-023)", async () => {
    const logger = new RecordingLogger();
    const { app } = createTestApp({
      airports,
      procedures,
      storage: new FakeChartStorage().failPresignWith(new Error("bucket fora do ar")),
      logger,
    });

    const response = await request(app).get("/v1/airports/SBGL/procedures/p1/chart");

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("CHART_STORAGE_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("bucket fora do ar");
    expect(logger.entries.some((entry) => entry.level === "error")).toBe(true);
  });

  it("recusa id com caractere de controle com 400 INVALID_PROCEDURE_ID", async () => {
    const { app } = createTestApp({ airports, procedures });

    const response = await request(app).get("/v1/airports/SBGL/procedures/%09/chart");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PROCEDURE_ID");
  });
});
