import type { Airport, AirportProcedure, Database } from "@open-nav-charts/domain";
import { createDatabase, runMigrations } from "@open-nav-charts/domain";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/http/create-app.js";
import { NullLogger } from "../src/observability/logger.js";
import { createAirportsRouter } from "../src/routes/airports-router.js";
import { createDocsRouter } from "../src/routes/docs-router.js";
import { createHealthRouter } from "../src/routes/health-router.js";
import { createProceduresRouter } from "../src/routes/procedures-router.js";
import { AirportService } from "../src/services/airport-service.js";
import { ChartService } from "../src/services/chart-service.js";
import { ProcedureService } from "../src/services/procedure-service.js";
import { FakeChartStorage } from "../src/testing/doubles.js";

/**
 * Ponta a ponta contra PostgreSQL real: exercita a migração, o SQL de listagem e
 * busca, e as rotas sobre eles. O bucket é dublê — a assinatura já é coberta por
 * teste próprio em `object-storage`, e o que importa aqui é o `302` sair com o
 * `Location` da chave certa.
 */
describe("API REST (integração)", () => {
  let container: StartedPostgreSqlContainer;
  let database: Database;
  let app: Express;
  const storage = new FakeChartStorage();

  const airports: readonly Airport[] = [
    {
      icao: "SBGL",
      name: "Rio de Janeiro / Galeão",
      city: "Rio de Janeiro",
      state: "RJ",
      country: "BR",
      latitude: -22.809999,
      longitude: -43.250556,
      runways: [
        { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
        { ident: "15/33", lengthMeters: 3180, widthMeters: 47 },
      ],
    },
    {
      icao: "SBRJ",
      name: "Santos Dumont",
      city: "Rio de Janeiro",
      state: "RJ",
      country: "BR",
      latitude: -22.910556,
      longitude: -43.163333,
      runways: [],
    },
    {
      icao: "SBSP",
      name: "Congonhas",
      city: "São Paulo",
      state: "SP",
      country: "BR",
      latitude: -23.626111,
      longitude: -46.656389,
      runways: [{ ident: "17R/35L", lengthMeters: 1940, widthMeters: 45 }],
    },
    // Aeródromo sem nenhum dado de localização: exercita `location` sempre
    // presente com campos nulos (FR-012) e a exclusão do filtro de país (FR-022).
    {
      icao: "SWXX",
      name: "Fazenda Sem Cadastro",
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
      runways: [],
    },
  ];

  const procedures: readonly AirportProcedure[] = [
    {
      id: "chart-1",
      airportIcao: "SBGL",
      name: "IAC ILS RWY 10",
      type: "IAC",
      amendment: "3",
      sourceUrl: "https://aisweb.example/chart-1.pdf",
      storageKey: "SBGL/chart-1.pdf",
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "chart-2",
      airportIcao: "SBGL",
      name: "SID DEKON 1A",
      type: "SID",
      amendment: null,
      sourceUrl: "https://aisweb.example/chart-2.pdf",
      storageKey: null,
      archivedAt: null,
    },
    {
      id: "chart-3",
      airportIcao: "SBSP",
      name: "IAC ILS RWY 17R",
      type: "IAC",
      amendment: null,
      sourceUrl: null,
      storageKey: "SBSP/chart-3.pdf",
      archivedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ];

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    await runMigrations({ url: container.getConnectionUri() });
    database = createDatabase({ url: container.getConnectionUri() });

    for (const airport of airports) {
      await database.airports.save(airport);
    }
    await database.procedures.saveAll(procedures);

    const logger = new NullLogger();
    app = createApp({
      logger,
      airports: createAirportsRouter({
        service: new AirportService({ repository: database.airports }),
      }),
      procedures: createProceduresRouter({
        procedures: new ProcedureService({
          airports: database.airports,
          procedures: database.procedures,
        }),
        charts: new ChartService({ procedures: database.procedures, storage, logger }),
      }),
      health: createHealthRouter({ ping: () => database.ping(), logger }),
      docs: createDocsRouter(),
      rateLimitMax: 10_000,
    });
  }, 180_000);

  afterAll(async () => {
    await database?.close();
    await container?.stop();
  });

  it("percorre a listagem inteira sem repetir nem omitir (SC-008)", async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 4; page += 1) {
      const response = await request(app).get(`/v1/airports?page=${page}&pageSize=1`);
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(4);
      seen.push(...response.body.items.map((item: { icao: string }) => item.icao));
    }

    expect(seen).toEqual(["SBGL", "SBRJ", "SBSP", "SWXX"]);
  });

  it("filtra por unidade federativa contra o banco real", async () => {
    const response = await request(app).get("/v1/airports?state=rj");

    expect(response.body.items.map((item: { icao: string }) => item.icao)).toEqual([
      "SBGL",
      "SBRJ",
    ]);
    expect(response.body.total).toBe(2);
  });

  it("filtra por país contra o banco real, insensível a caixa (FR-014, FR-016)", async () => {
    const maiusculas = await request(app).get("/v1/airports?country=BR");
    const minusculas = await request(app).get("/v1/airports?country=br");

    expect(maiusculas.status).toBe(200);
    expect(maiusculas.body.items.map((item: { icao: string }) => item.icao)).toEqual([
      "SBGL",
      "SBRJ",
      "SBSP",
    ]);
    // O aeródromo sem país registrado fica de fora do recorte (FR-022), e o
    // total reflete só o conjunto filtrado (FR-017).
    expect(maiusculas.body.total).toBe(3);
    expect(minusculas.body).toEqual(maiusculas.body);
  });

  it("combina o filtro de país com UF e busca (FR-015)", async () => {
    const comUf = await request(app).get("/v1/airports?country=BR&state=rj");
    const comBusca = await request(app).get("/v1/airports?country=BR&search=galeao");

    expect(comUf.body.items.map((item: { icao: string }) => item.icao)).toEqual(["SBGL", "SBRJ"]);
    expect(comUf.body.total).toBe(2);
    expect(comBusca.body.items.map((item: { icao: string }) => item.icao)).toEqual(["SBGL"]);
  });

  it("responde 200 com lista vazia para país bem formado sem correspondência (FR-019, FR-021)", async () => {
    const response = await request(app).get("/v1/airports?country=XX");

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it("recusa país malformado com 400 INVALID_COUNTRY (FR-018)", async () => {
    for (const value of ["Brazil", "BRA", "B", "B1"]) {
      const response = await request(app).get(`/v1/airports?country=${value}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_COUNTRY");
      expect(response.body.error.message).toContain("2 letras");
    }
  });

  it("publica country e INVALID_COUNTRY no contrato de /docs (FR-023, FR-024)", async () => {
    const response = await request(app).get("/docs");
    const listagem = response.body.endpoints.find(
      (endpoint: { path: string }) => endpoint.path === "/v1/airports",
    );
    const ficha = response.body.endpoints.find(
      (endpoint: { path: string }) => endpoint.path === "/v1/airports/:icao",
    );

    expect(listagem.query).toHaveProperty("country");
    expect(listagem.errors).toContain("INVALID_COUNTRY");
    expect(ficha.response).toHaveProperty("location");
    expect(ficha.response).not.toHaveProperty("city");
    expect(response.body.errorFormat.codes).toContain("INVALID_COUNTRY");
  });

  it("busca sem acento encontra o registro acentuado gravado pelo repositório", async () => {
    for (const termo of ["galeao", "GALEÃO", "sao paulo"] as const) {
      const response = await request(app).get(`/v1/airports?search=${encodeURIComponent(termo)}`);
      expect(response.status).toBe(200);
      expect(response.body.items).not.toHaveLength(0);
    }

    const galeao = await request(app).get("/v1/airports?search=galeao");
    expect(galeao.body.items.map((item: { icao: string }) => item.icao)).toEqual(["SBGL"]);
  });

  it("devolve o detalhe com as pistas", async () => {
    const response = await request(app).get("/v1/airports/sbgl");

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Rio de Janeiro / Galeão");
    expect(response.body.runways).toHaveLength(2);
    expect(response.body.location.latitude).toBeCloseTo(-22.809999, 6);
  });

  it("agrupa a localização em location nas duas rotas (FR-007, FR-008, FR-009)", async () => {
    const detalhe = await request(app).get("/v1/airports/sbgl");
    const listagem = await request(app).get("/v1/airports?search=galeao");
    const item = listagem.body.items[0];

    for (const body of [detalhe.body, item]) {
      expect(body.location).toMatchObject({
        city: "Rio de Janeiro",
        state: "RJ",
        country: "BR",
      });
      for (const field of ["city", "state", "country", "latitude", "longitude"]) {
        expect(body).not.toHaveProperty(field);
      }
    }

    // Listagem e ficha compartilham o mesmo objeto de localização.
    expect(item.location).toEqual(detalhe.body.location);
  });

  it("mantém location com todos os campos nulos quando a fonte não os traz (FR-011, FR-012)", async () => {
    const response = await request(app).get("/v1/airports/SWXX");

    expect(response.status).toBe(200);
    expect(response.body.location).toEqual({
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
    });
  });

  it("lista os procedimentos com hasChart e sem campos internos", async () => {
    const response = await request(app).get("/v1/airports/SBGL/procedures");

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(
      response.body.items.map((item: { id: string; hasChart: boolean }) => [
        item.id,
        item.hasChart,
      ]),
    ).toEqual([
      ["chart-1", true],
      ["chart-2", false],
    ]);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("aisweb.example");
  });

  it("responde 302 com Location assinado para a carta arquivada", async () => {
    const response = await request(app).get("/v1/airports/SBGL/procedures/chart-1/chart");

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("SBGL/chart-1.pdf");
    expect(response.headers.location).toContain("X-Amz-Expires=300");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("distingue carta ausente de procedimento de outro aeródromo", async () => {
    const semDocumento = await request(app).get("/v1/airports/SBGL/procedures/chart-2/chart");
    const deOutro = await request(app).get("/v1/airports/SBGL/procedures/chart-3/chart");

    expect(semDocumento.body.error.code).toBe("CHART_NOT_AVAILABLE");
    expect(deOutro.body.error.code).toBe("PROCEDURE_NOT_FOUND");
    expect(JSON.stringify(deOutro.body)).not.toContain("SBSP");
  });

  it("responde saúde com o banco disponível", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", checks: { database: "ok" } });
  });

  it("nenhuma resposta de erro expõe SQL ou host do banco (SC-009)", async () => {
    const responses = await Promise.all([
      request(app).get("/v1/airports/SBXX"),
      request(app).get("/v1/airports?pageSize=500"),
      request(app).get("/v1/rota-inexistente"),
    ]);

    for (const response of responses) {
      const serialized = JSON.stringify(response.body);
      expect(serialized.toLowerCase()).not.toContain("select ");
      expect(serialized).not.toContain("5432");
      expect(serialized).not.toContain("    at ");
    }
  });
});
