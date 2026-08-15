import request from "supertest";
import { describe, expect, it } from "vitest";
import { airport } from "../testing/doubles.js";
import { createTestApp } from "../testing/test-app.js";

describe("limitação de taxa (FR-030)", () => {
  it("devolve 429 RATE_LIMITED com Retry-After acima do limite", async () => {
    const { app } = createTestApp({ airports: [airport({ icao: "SBGL" })], rateLimitMax: 3 });

    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get("/v1/airports")).status).toBe(200);
    }

    const excedida = await request(app).get("/v1/airports");

    expect(excedida.status).toBe(429);
    expect(excedida.body.error.code).toBe("RATE_LIMITED");
    expect(excedida.headers["retry-after"]).toBe("60");
  });

  it("anuncia a janela e o saldo em cabeçalhos padronizados", async () => {
    const { app } = createTestApp({ rateLimitMax: 5 });

    const response = await request(app).get("/v1/airports");

    expect(response.headers["ratelimit"] ?? response.headers["ratelimit-limit"]).toBeDefined();
  });

  it("isenta /health do limite, para a verificação não ser bloqueada", async () => {
    const { app } = createTestApp({ rateLimitMax: 1 });

    for (let i = 0; i < 5; i += 1) {
      expect((await request(app).get("/health")).status).toBe(200);
    }
  });
});

describe("borda HTTP", () => {
  it("devolve 404 ROUTE_NOT_FOUND em envelope uniforme para rota inexistente", async () => {
    const { app } = createTestApp({});

    const response = await request(app).get("/v1/rota-inexistente");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "ROUTE_NOT_FOUND", message: expect.stringContaining("Rota não encontrada") },
    });
  });

  it("devolve 405 METHOD_NOT_ALLOWED para método de escrita (FR-025)", async () => {
    const { app } = createTestApp({ airports: [airport({ icao: "SBGL" })] });

    for (const method of ["post", "put", "patch", "delete"] as const) {
      const response = await request(app)[method]("/v1/airports");
      expect(response.status).toBe(405);
      expect(response.body.error.code).toBe("METHOD_NOT_ALLOWED");
    }
  });

  it("libera CORS para leitura pública (FR-028)", async () => {
    const { app } = createTestApp({});

    const response = await request(app).get("/v1/airports");

    expect(response.headers["access-control-allow-origin"]).toBe("*");
  });

  it("aplica os cabeçalhos de segurança do helmet e omite x-powered-by", async () => {
    const { app } = createTestApp({});

    const response = await request(app).get("/v1/airports");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("responde JSON em UTF-8", async () => {
    const { app } = createTestApp({});

    const response = await request(app).get("/v1/airports");

    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-type"]).toContain("utf-8");
  });
});

describe("GET /docs", () => {
  it("publica o contrato dos endpoints e dos códigos de erro (FR-032)", async () => {
    const { app } = createTestApp({});

    const response = await request(app).get("/docs");

    expect(response.status).toBe(200);
    const paths = response.body.endpoints.map((endpoint: { path: string }) => endpoint.path);
    expect(paths).toContain("/v1/airports");
    expect(paths).toContain("/v1/airports/:icao");
    expect(paths).toContain("/v1/airports/:icao/procedures");
    expect(paths).toContain("/v1/airports/:icao/procedures/:id/chart");
    expect(response.body.errorFormat.codes).toContain("AIRPORT_NOT_FOUND");
    expect(response.body.errorFormat.codes).toContain("CHART_NOT_AVAILABLE");
  });

  it("traz o caminho de ponta a ponta, de listar a abrir uma carta (SC-006)", async () => {
    const { app } = createTestApp({});

    const response = await request(app).get("/docs");

    expect(response.body.quickstart.join("\n")).toContain("/v1/airports");
    expect(response.body.quickstart.join("\n")).toContain("chart");
  });

  it("descreve os limites reais aplicados pelo código", async () => {
    const { app } = createTestApp({});

    const response = await request(app).get("/docs");

    expect(response.body.rateLimit.maxRequests).toBe(120);
    expect(response.body.rateLimit.windowSeconds).toBe(60);
  });
});
