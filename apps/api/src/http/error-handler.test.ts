import request from "supertest";
import { describe, expect, it } from "vitest";
import { RecordingLogger } from "../observability/logger.js";
import {
  airport,
  archivedProcedure,
  FakeAirportRepository,
  FakeChartStorage,
  FakeHealthProbe,
  procedure,
} from "../testing/doubles.js";
import { createTestApp } from "../testing/test-app.js";
import { ERROR_CODES } from "./api-error.js";

const airports = [airport({ icao: "SBGL" }), airport({ icao: "SBSP" })];
const procedures = [
  archivedProcedure({ id: "p1", airportIcao: "SBGL" }),
  procedure({ id: "p2", airportIcao: "SBGL" }),
];

/** Cada entrada exercita um código do contrato numa requisição real. */
const cases: readonly {
  code: string;
  status: number;
  run: () => Promise<request.Response>;
}[] = [
  {
    code: "INVALID_ICAO",
    status: 400,
    run: () => request(createTestApp({ airports, procedures }).app).get("/v1/airports/XX"),
  },
  {
    code: "INVALID_PROCEDURE_ID",
    status: 400,
    run: () =>
      request(createTestApp({ airports, procedures }).app).get(
        "/v1/airports/SBGL/procedures/%09/chart",
      ),
  },
  {
    code: "INVALID_PAGINATION",
    status: 400,
    run: () =>
      request(createTestApp({ airports, procedures }).app).get("/v1/airports?pageSize=500"),
  },
  {
    code: "INVALID_STATE",
    status: 400,
    run: () => request(createTestApp({ airports, procedures }).app).get("/v1/airports?state=RJX"),
  },
  {
    code: "INVALID_COUNTRY",
    status: 400,
    run: () => request(createTestApp({ airports, procedures }).app).get("/v1/airports?country=BRA"),
  },
  {
    code: "INVALID_SEARCH",
    status: 400,
    run: () => request(createTestApp({ airports, procedures }).app).get("/v1/airports?search="),
  },
  {
    code: "INVALID_PROCEDURE_TYPE",
    status: 400,
    run: () =>
      request(createTestApp({ airports, procedures }).app).get(
        "/v1/airports/SBGL/procedures?type=",
      ),
  },
  {
    code: "AIRPORT_NOT_FOUND",
    status: 404,
    run: () => request(createTestApp({ airports, procedures }).app).get("/v1/airports/SBXX"),
  },
  {
    code: "PROCEDURE_NOT_FOUND",
    status: 404,
    run: () =>
      request(createTestApp({ airports, procedures }).app).get(
        "/v1/airports/SBGL/procedures/inexistente/chart",
      ),
  },
  {
    code: "CHART_NOT_AVAILABLE",
    status: 404,
    run: () =>
      request(createTestApp({ airports, procedures }).app).get(
        "/v1/airports/SBGL/procedures/p2/chart",
      ),
  },
  {
    code: "ROUTE_NOT_FOUND",
    status: 404,
    run: () => request(createTestApp({}).app).get("/v1/rota-inexistente"),
  },
  {
    code: "METHOD_NOT_ALLOWED",
    status: 405,
    run: () => request(createTestApp({}).app).post("/v1/airports"),
  },
  {
    code: "RATE_LIMITED",
    status: 429,
    run: async () => {
      const { app } = createTestApp({ airports, rateLimitMax: 1 });
      await request(app).get("/v1/airports");
      return request(app).get("/v1/airports");
    },
  },
  {
    code: "CHART_STORAGE_UNAVAILABLE",
    status: 502,
    run: () =>
      request(
        createTestApp({
          airports,
          procedures,
          storage: new FakeChartStorage().failPresignWith(
            new Error("select * from airport falhou em pg-host-interno:5432"),
          ),
        }).app,
      ).get("/v1/airports/SBGL/procedures/p1/chart"),
  },
  {
    code: "INTERNAL_ERROR",
    status: 500,
    run: () =>
      request(
        createTestApp({
          airportRepository: new FakeAirportRepository(airports).failWith(
            new Error('relation "airport" does not exist at pg-host-interno:5432'),
          ),
        }).app,
      ).get("/v1/airports"),
  },
];

describe("envelope de erro (FR-026, SC-007)", () => {
  it.each(cases)("$code responde $status no envelope uniforme", async ({ code, status, run }) => {
    const response = await run();

    expect(response.status).toBe(status);
    expect(Object.keys(response.body)).toEqual(["error"]);
    expect(Object.keys(response.body.error).sort()).toEqual(["code", "message"]);
    expect(response.body.error.code).toBe(code);
    expect(typeof response.body.error.message).toBe("string");
    expect(response.body.error.message.length).toBeGreaterThan(0);
  });

  it.each(cases)("$code não vaza detalhe interno (FR-035, SC-009)", async ({ run }) => {
    const response = await run();
    const serialized = JSON.stringify(response.body);

    // Rastreamento de pilha
    expect(serialized).not.toContain("    at ");
    expect(serialized).not.toContain(".ts:");
    expect(serialized).not.toContain("node_modules");
    expect(serialized).not.toMatch(/\bError:/);
    // SQL e nome de recurso de infraestrutura
    expect(serialized.toLowerCase()).not.toContain("select ");
    expect(serialized.toLowerCase()).not.toContain("relation ");
    expect(serialized).not.toContain("pg-host-interno");
    expect(serialized).not.toContain("5432");
  });

  it("cobre todos os códigos do contrato, exceto o de dependência indisponível", async () => {
    const covered = new Set(cases.map((entry) => entry.code));
    // SERVICE_UNAVAILABLE pertence a `/health`, que responde fora do envelope de
    // erro por ser rota operacional com corpo próprio.
    const expected = ERROR_CODES.filter((code) => code !== "SERVICE_UNAVAILABLE");

    expect([...covered].sort()).toEqual([...expected].sort());
  });
});

describe("falha não prevista", () => {
  it("vira 500 genérico e registra a causa real só no log do servidor", async () => {
    const logger = new RecordingLogger();
    const { app } = createTestApp({
      airportRepository: new FakeAirportRepository(airports).failWith(
        new Error("connection terminated unexpectedly"),
      ),
      logger,
    });

    const response = await request(app).get("/v1/airports");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("connection terminated");
    expect(
      logger.entries.some((entry) =>
        String(entry.fields.reason ?? "").includes("connection terminated"),
      ),
    ).toBe(true);
  });
});

describe("/health fora do envelope de erro", () => {
  it("responde 503 com o corpo de saúde, não com { error }", async () => {
    const { app } = createTestApp({
      health: new FakeHealthProbe().failWith(new Error("indisponível")),
    });

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toHaveProperty("status", "degraded");
    expect(response.body).not.toHaveProperty("error");
  });
});
