import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/index.js";
import { createDatabase, runMigrations } from "../src/index.js";

const SOURCE = "aisweb-ifr-charts";
const current = { lastUpdate: "2026-09-30 17:35:34", airacCycle: "2026-10-01" } as const;
const first = new Date("2026-10-01T03:00:00.000Z");
const later = new Date("2026-10-08T03:00:00.000Z");

describe("DrizzleSourceSyncStateRepository (integração)", () => {
  let container: StartedPostgreSqlContainer;
  let database: Database;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    await runMigrations({ url: container.getConnectionUri() });
    database = createDatabase({ url: container.getConnectionUri() });
  }, 120_000);

  afterAll(async () => {
    await database?.close();
    await container?.stop();
  });

  beforeEach(async () => {
    const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    try {
      await pool.query("truncate table source_sync_state");
    } finally {
      await pool.end();
    }
  });

  it("não encontra fonte nunca observada", async () => {
    expect(await database.syncState.find(SOURCE)).toBeNull();
  });

  it("grava a primeira observação com o momento informado", async () => {
    const state = await database.syncState.observe(SOURCE, current, first);

    expect(state).toEqual({ source: SOURCE, ...current, observedAt: first });
    expect(await database.syncState.find(SOURCE)).toEqual(state);
  });

  it("preserva o momento da primeira observação enquanto o par não muda", async () => {
    await database.syncState.observe(SOURCE, current, first);

    const state = await database.syncState.observe(SOURCE, current, later);

    expect(state.observedAt).toEqual(first);
    expect((await database.syncState.find(SOURCE))?.observedAt).toEqual(first);
  });

  it("substitui o par e o momento quando o ciclo AIRAC muda", async () => {
    await database.syncState.observe(SOURCE, current, first);

    const state = await database.syncState.observe(
      SOURCE,
      { ...current, airacCycle: "2026-10-29" },
      later,
    );

    expect(state).toEqual({
      source: SOURCE,
      lastUpdate: current.lastUpdate,
      airacCycle: "2026-10-29",
      observedAt: later,
    });
  });

  it("trata valor ilegível contra valor registrado como mudança", async () => {
    await database.syncState.observe(SOURCE, current, first);

    const state = await database.syncState.observe(SOURCE, { ...current, lastUpdate: null }, later);

    expect(state.lastUpdate).toBeNull();
    expect(state.observedAt).toEqual(later);
  });

  it("não trata nulo repetido como mudança", async () => {
    const empty = { lastUpdate: null, airacCycle: null };
    await database.syncState.observe(SOURCE, empty, first);

    const state = await database.syncState.observe(SOURCE, empty, later);

    expect(state.observedAt).toEqual(first);
  });
});
