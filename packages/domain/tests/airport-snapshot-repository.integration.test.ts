import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Airport, Database } from "../src/index.js";
import { createDatabase, runMigrations } from "../src/index.js";

const sbgl: Airport = {
  icao: "SBGL",
  name: "Galeão - Antônio Carlos Jobim",
  city: "Rio de Janeiro",
  state: "RJ",
  country: "BR",
  latitude: -22.81,
  longitude: -43.250555555556,
  runways: [
    { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
    { ident: "15/33", lengthMeters: 3180, widthMeters: 47 },
  ],
};

const sdco: Airport = {
  icao: "SDCO",
  name: "Sorocaba",
  city: null,
  state: null,
  country: "BR",
  latitude: null,
  longitude: null,
  runways: [],
};

describe("DrizzleAirportSnapshotRepository (integração)", () => {
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
      await pool.query("truncate table airport cascade");
    } finally {
      await pool.end();
    }
  });

  it("devolve base vazia como mapa vazio", async () => {
    expect((await database.snapshots.loadAll()).size).toBe(0);
  });

  it("carrega aeródromos com pistas, cartas e o estado da revalidação, indexados por ICAO", async () => {
    const checkedAt = new Date("2026-10-08T12:00:00.000Z");
    await database.sync.syncAirport({
      airport: sbgl,
      procedures: [
        {
          id: "c1",
          airportIcao: "SBGL",
          name: "RNP Y RWY 28",
          type: "IAC",
          amendment: "2601A1",
          sourceUrl: "https://exemplo/c1",
          storageKey: "SBGL/c1.pdf",
          archivedAt: checkedAt,
        },
      ],
      runwaysCheck: { at: checkedAt, sourceUpdatedOn: "2026-10-08" },
    });
    await database.sync.syncAirport({ airport: sdco, procedures: [] });

    const snapshots = await database.snapshots.loadAll();

    expect([...snapshots.keys()].sort()).toEqual(["SBGL", "SDCO"]);
    const snapshot = snapshots.get("SBGL");
    expect(snapshot?.runwaysCheckedAt).toEqual(checkedAt);
    expect(snapshot?.sourceUpdatedOn).toBe("2026-10-08");
    expect(snapshot?.airport.name).toBe(sbgl.name);
    // Coordenada volta com as 6 casas de `numeric(9,6)`.
    expect(snapshot?.airport.longitude).toBe(-43.250556);
    expect(snapshot?.airport.runways).toHaveLength(2);
    expect(snapshot?.procedures.map((procedure) => procedure.id)).toEqual(["c1"]);
  });

  it("carrega aeródromo sem pista nem carta com listas vazias e revalidação nula", async () => {
    await database.sync.syncAirport({ airport: sdco, procedures: [] });

    const snapshot = (await database.snapshots.loadAll()).get("SDCO");

    expect(snapshot?.airport.runways).toEqual([]);
    expect(snapshot?.procedures).toEqual([]);
    expect(snapshot?.runwaysCheckedAt).toBeNull();
    expect(snapshot?.sourceUpdatedOn).toBeNull();
  });
});
