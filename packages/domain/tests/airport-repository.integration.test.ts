import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Airport, Database } from "../src/index.js";
import { createDatabase, runMigrations } from "../src/index.js";

/**
 * Integração: exige Docker e roda apenas por `pnpm test:integration`, fora do
 * `pnpm test` padrão (research R9). Valida o SQL gerado e as migrações, que
 * dublês nunca validam.
 */
describe("DrizzleAirportRepository (integração)", () => {
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
    // Independência de ordem entre testes é exigência do Princípio IV.
    // O CASCADE derruba pistas e procedimentos junto com os aeródromos.
    const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    try {
      await pool.query("truncate table airport cascade");
    } finally {
      await pool.end();
    }
  });

  function airport(overrides: Partial<Airport> = {}): Airport {
    return {
      icao: "SBGL",
      name: "Galeão - Antônio Carlos Jobim",
      city: "Rio de Janeiro",
      state: "RJ",
      country: "BR",
      latitude: -22.81,
      longitude: -43.250556,
      runways: [{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }],
      ...overrides,
    };
  }

  it("aplica as migrações e grava um aeródromo com pistas", async () => {
    await database.airports.save(airport());

    const found = await database.airports.findByIcao("SBGL");

    expect(found?.name).toBe("Galeão - Antônio Carlos Jobim");
    expect(found?.city).toBe("Rio de Janeiro");
    expect(found?.latitude).toBeCloseTo(-22.81, 6);
    expect(found?.longitude).toBeCloseTo(-43.250556, 6);
    expect(found?.runways).toEqual([{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }]);
  });

  it("faz upsert por ICAO sem duplicar em reexecução", async () => {
    await database.airports.save(airport());
    await database.airports.save(airport({ name: "Galeão (atualizado)" }));

    const found = await database.airports.findByIcao("SBGL");

    expect(found?.name).toBe("Galeão (atualizado)");
    expect(await database.airports.listByState("RJ")).toHaveLength(1);
  });

  it("substitui as pistas integralmente a cada gravação", async () => {
    await database.airports.save(
      airport({
        runways: [
          { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
          { ident: "15/33", lengthMeters: 3180, widthMeters: 47 },
        ],
      }),
    );

    await database.airports.save(
      airport({ runways: [{ ident: "10/28", lengthMeters: 4100, widthMeters: 45 }] }),
    );

    const found = await database.airports.findByIcao("SBGL");
    expect(found?.runways).toEqual([{ ident: "10/28", lengthMeters: 4100, widthMeters: 45 }]);
  });

  it("não falha quando a lista traz a mesma pista repetida", async () => {
    // Caso real (SNAO, SNCW, SSNG, SSWN): sem deduplicar, o unique
    // (airport_icao, ident) derrubaria a transação do aeródromo inteiro.
    await database.airports.save(
      airport({
        runways: [
          { ident: "09/27", lengthMeters: 24, widthMeters: 24 },
          { ident: "09/27", lengthMeters: 1295, widthMeters: 28 },
        ],
      }),
    );

    const found = await database.airports.findByIcao("SBGL");
    expect(found?.runways).toHaveLength(1);
  });

  it("aceita aeródromo sem cidade, UF, coordenadas e pistas", async () => {
    await database.airports.save({
      icao: "SWXX",
      name: "Fazenda Sem Cadastro",
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
      runways: [],
    });

    const found = await database.airports.findByIcao("SWXX");

    expect(found?.city).toBeNull();
    expect(found?.state).toBeNull();
    expect(found?.country).toBeNull();
    expect(found?.latitude).toBeNull();
    expect(found?.runways).toEqual([]);
  });

  it("faz o round-trip do país: grava o código e o devolve na leitura", async () => {
    await database.airports.save(airport());

    const found = await database.airports.findByIcao("SBGL");

    expect(found?.country).toBe("BR");
  });

  it("reescreve o país no upsert, sem duplicar o registro", async () => {
    await database.airports.save(airport({ country: "BR" }));
    await database.airports.save(airport({ country: "PT" }));

    const found = await database.airports.findByIcao("SBGL");

    expect(found?.country).toBe("PT");
    expect(await database.airports.listByState("RJ")).toHaveLength(1);
  });

  it("lista por UF trazendo as pistas de cada aeródromo", async () => {
    await database.airports.save(airport());
    await database.airports.save(
      airport({
        icao: "SBRJ",
        name: "Santos Dumont",
        runways: [{ ident: "02L/20R", lengthMeters: 1323, widthMeters: 42 }],
      }),
    );

    const found = await database.airports.listByState("RJ");

    expect(found).toHaveLength(2);
    expect(found.find((item) => item.icao === "SBRJ")?.runways).toEqual([
      { ident: "02L/20R", lengthMeters: 1323, widthMeters: 42 },
    ]);
  });

  it("devolve null para ICAO inexistente", async () => {
    expect(await database.airports.findByIcao("ZZZZ")).toBeNull();
  });

  it("é idempotente: rodar as migrações duas vezes não falha", async () => {
    await expect(runMigrations({ url: container.getConnectionUri() })).resolves.toBeUndefined();
  });
});
