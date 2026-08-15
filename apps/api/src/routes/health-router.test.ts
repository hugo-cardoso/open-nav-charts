import request from "supertest";
import { describe, expect, it } from "vitest";
import { RecordingLogger } from "../observability/logger.js";
import { FakeHealthProbe } from "../testing/doubles.js";
import { createTestApp } from "../testing/test-app.js";

describe("GET /health", () => {
  it("devolve 200 com status ok quando o banco responde", async () => {
    const { app } = createTestApp({});

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", checks: { database: "ok" } });
  });

  it("devolve 503 com status degraded quando a verificação do banco falha", async () => {
    const health = new FakeHealthProbe().failWith(new Error("conexão recusada"));
    const { app } = createTestApp({ health });

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "degraded", checks: { database: "unavailable" } });
  });

  it("não expõe a causa da falha ao consumidor, mas a registra no log", async () => {
    const logger = new RecordingLogger();
    const { app } = createTestApp({
      health: new FakeHealthProbe().failWith(new Error("password authentication failed")),
      logger,
    });

    const response = await request(app).get("/health");

    expect(JSON.stringify(response.body)).not.toContain("password");
    expect(logger.entries.some((entry) => entry.level === "error")).toBe(true);
  });

  it("volta a 200 assim que a dependência se recupera", async () => {
    const health = new FakeHealthProbe().failWith(new Error("indisponível"));
    const { app } = createTestApp({ health });

    expect((await request(app).get("/health")).status).toBe(503);
    health.recover();
    expect((await request(app).get("/health")).status).toBe(200);
  });

  it("não verifica o bucket: só o banco entra no relatório (research R10)", async () => {
    const { app } = createTestApp({});

    const response = await request(app).get("/health");

    expect(Object.keys(response.body.checks)).toEqual(["database"]);
  });
});
