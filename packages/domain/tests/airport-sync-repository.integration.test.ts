import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Airport, AirportProcedure, Database } from "../src/index.js";
import { createDatabase, runMigrations } from "../src/index.js";

const airport: Airport = {
  icao: "SBGL",
  name: "Galeão - Antônio Carlos Jobim",
  city: "Rio de Janeiro",
  state: "RJ",
  country: "BR",
  latitude: -22.81,
  longitude: -43.250556,
  runways: [{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }],
};

function procedure(
  overrides: Partial<AirportProcedure> & Pick<AirportProcedure, "id">,
): AirportProcedure {
  return {
    airportIcao: "SBGL",
    name: `Carta ${overrides.id}`,
    type: "IAC",
    amendment: "2601A1",
    sourceUrl: null,
    storageKey: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("DrizzleAirportSyncRepository (integração)", () => {
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

  async function readAirportRow(icao: string): Promise<Record<string, unknown>> {
    const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    try {
      const result = await pool.query("select * from airport where icao = $1", [icao]);
      return result.rows[0] as Record<string, unknown>;
    } finally {
      await pool.end();
    }
  }

  beforeEach(async () => {
    const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    try {
      await pool.query("truncate table airport cascade");
    } finally {
      await pool.end();
    }
  });

  it("grava aeródromo, pistas e cartas em uma única transação", async () => {
    const result = await database.sync.syncAirport({
      airport,
      procedures: [procedure({ id: "c1" }), procedure({ id: "c2" })],
    });

    expect(result.removedProcedureIds).toEqual([]);
    expect((await database.airports.findByIcao("SBGL"))?.runways).toHaveLength(1);
    expect(await database.procedures.listByAirport("SBGL")).toHaveLength(2);
  });

  it("devolve os ids das cartas que saíram de vigência", async () => {
    await database.sync.syncAirport({
      airport,
      procedures: [procedure({ id: "c1" }), procedure({ id: "antiga" })],
    });

    const result = await database.sync.syncAirport({
      airport,
      procedures: [procedure({ id: "c1" })],
    });

    expect(result.removedProcedureIds).toEqual(["antiga"]);
    expect((await database.procedures.listByAirport("SBGL")).map((item) => item.id)).toEqual([
      "c1",
    ]);
  });

  it("é idempotente: reexecutar não duplica aeródromo nem cartas", async () => {
    const input = { airport, procedures: [procedure({ id: "c1" })] };

    await database.sync.syncAirport(input);
    await database.sync.syncAirport(input);

    expect(await database.airports.listByState("RJ")).toHaveLength(1);
    expect(await database.procedures.listByAirport("SBGL")).toHaveLength(1);
  });

  it("atualiza a emenda alterada sem criar uma carta nova", async () => {
    await database.sync.syncAirport({
      airport,
      procedures: [procedure({ id: "c1", amendment: "2601A1" })],
    });

    await database.sync.syncAirport({
      airport,
      procedures: [procedure({ id: "c1", amendment: "2602A1" })],
    });

    const persisted = await database.procedures.listByAirport("SBGL");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.amendment).toBe("2602A1");
  });

  it("preserva a chave de arquivamento quando a coleta pula os documentos", async () => {
    const archivedAt = new Date("2026-08-01T10:00:00Z");
    await database.sync.syncAirport({
      airport,
      procedures: [procedure({ id: "c1", storageKey: "SBGL/c1.pdf", archivedAt })],
    });

    // Reexecução com --skip-documents traz storage_key nula.
    await database.sync.syncAirport({
      airport,
      procedures: [procedure({ id: "c1", storageKey: null, archivedAt: null })],
    });

    const persisted = await database.procedures.listByAirport("SBGL");
    expect(persisted[0]?.storageKey).toBe("SBGL/c1.pdf");
    expect(persisted[0]?.archivedAt?.toISOString()).toBe(archivedAt.toISOString());
  });

  it("grava o estado da revalidação das pistas quando informado e o preserva quando omitido", async () => {
    const checkedAt = new Date("2026-10-08T12:00:00.000Z");
    await database.sync.syncAirport({
      airport,
      procedures: [],
      runwaysCheck: { at: checkedAt, sourceUpdatedOn: "2026-10-08" },
    });

    await database.sync.syncAirport({ airport: { ...airport, name: "Galeão" }, procedures: [] });

    const row = await readAirportRow("SBGL");
    expect(row.runways_checked_at).toEqual(checkedAt);
    expect(row.source_updated_on).toBe("2026-10-08");
  });

  it("marca a revalidação em lote sem tocar os demais dados nem updated_at", async () => {
    await database.sync.syncAirport({ airport, procedures: [] });
    await database.sync.syncAirport({
      airport: { ...airport, icao: "SBSP", name: "Congonhas" },
      procedures: [],
    });
    const before = await readAirportRow("SBGL");
    const checkedAt = new Date("2026-10-08T12:00:00.000Z");

    await database.sync.markRunwaysChecked([
      { icao: "SBGL", at: checkedAt, sourceUpdatedOn: "2026-10-08" },
      { icao: "SBSP", at: checkedAt, sourceUpdatedOn: null },
    ]);

    const sbgl = await readAirportRow("SBGL");
    expect(sbgl.runways_checked_at).toEqual(checkedAt);
    expect(sbgl.source_updated_on).toBe("2026-10-08");
    expect(sbgl.updated_at).toEqual(before.updated_at);
    expect(sbgl.name).toBe(airport.name);
    expect((await readAirportRow("SBSP")).runways_checked_at).toEqual(checkedAt);
  });

  it("marcar uma lista vazia não falha", async () => {
    await expect(database.sync.markRunwaysChecked([])).resolves.toBeUndefined();
  });

  it("preserva archived_at enquanto a chave de arquivamento não muda", async () => {
    const archivedAt = new Date("2026-08-15T12:00:00.000Z");
    await database.sync.syncAirport({
      airport,
      procedures: [procedure({ id: "c1", storageKey: "SBGL/c1.pdf", archivedAt })],
    });

    await database.sync.syncAirport({
      airport,
      procedures: [
        procedure({
          id: "c1",
          storageKey: "SBGL/c1.pdf",
          archivedAt: new Date("2026-10-08T12:00:00.000Z"),
          amendment: "2610A1",
        }),
      ],
    });

    const [stored] = await database.procedures.listByAirport("SBGL");
    expect(stored?.amendment).toBe("2610A1");
    expect(stored?.archivedAt).toEqual(archivedAt);
  });

  it("regrava archived_at quando a chave de arquivamento muda", async () => {
    await database.sync.syncAirport({ airport, procedures: [procedure({ id: "c1" })] });
    const archivedAt = new Date("2026-10-08T12:00:00.000Z");

    await database.sync.syncAirport({
      airport,
      procedures: [procedure({ id: "c1", storageKey: "SBGL/c1.pdf", archivedAt })],
    });

    const [stored] = await database.procedures.listByAirport("SBGL");
    expect(stored?.storageKey).toBe("SBGL/c1.pdf");
    expect(stored?.archivedAt).toEqual(archivedAt);
  });

  it("não deixa gravação parcial quando a transação falha", async () => {
    // `name` vazio não viola constraint, mas um ICAO fora do char(4) sim:
    // a transação inteira deve reverter, sem aeródromo nem cartas.
    await expect(
      database.sync.syncAirport({
        airport: { ...airport, icao: "SBGL" },
        procedures: [procedure({ id: "c1", airportIcao: "ZZZZ" })],
      }),
    ).rejects.toBeDefined();

    expect(await database.airports.findByIcao("SBGL")).toBeNull();
  });

  it("grava aeródromo sem nenhuma carta", async () => {
    const result = await database.sync.syncAirport({ airport, procedures: [] });

    expect(result.removedProcedureIds).toEqual([]);
    expect(await database.airports.findByIcao("SBGL")).not.toBeNull();
    expect(await database.procedures.listByAirport("SBGL")).toEqual([]);
  });

  it("apaga as cartas em cascata quando o aeródromo some", async () => {
    await database.sync.syncAirport({ airport, procedures: [procedure({ id: "c1" })] });

    const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    try {
      await pool.query("delete from airport where icao = $1", ["SBGL"]);
    } finally {
      await pool.end();
    }

    expect(await database.procedures.listByAirport("SBGL")).toEqual([]);
  });
});
