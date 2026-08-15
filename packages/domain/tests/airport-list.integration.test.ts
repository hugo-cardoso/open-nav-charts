import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Airport, AirportProcedure, Database } from "../src/index.js";
import { createDatabase, normalizeSearchText, runMigrations } from "../src/index.js";

/**
 * Integração das extensões que a API REST exige: listagem paginada, filtro por
 * UF, busca insensível a acentuação e resolução de procedimento por id. Exige
 * Docker e roda apenas por `pnpm test:integration` (research R12).
 */
describe("extensões de consulta (integração)", () => {
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

  function airport(overrides: Partial<Airport> & Pick<Airport, "icao">): Airport {
    return {
      name: `Aeródromo ${overrides.icao}`,
      city: "Cidade",
      state: "RJ",
      latitude: -22.81,
      longitude: -43.250556,
      runways: [],
      ...overrides,
    };
  }

  async function saveAll(icaos: readonly string[]): Promise<void> {
    for (const icao of icaos) {
      await database.airports.save(airport({ icao }));
    }
  }

  describe("AirportRepository.list", () => {
    it("pagina sem repetir nem omitir nenhum aeródromo (SC-008)", async () => {
      const icaos = ["SBGL", "SBSP", "SBBR", "SBCF", "SBPA", "SBGR", "SBRJ"];
      await saveAll(icaos);

      const seen: string[] = [];
      let page = 1;
      let total = 0;
      for (;;) {
        const result = await database.airports.list({ page, pageSize: 3 });
        total = result.total;
        if (result.items.length === 0) {
          break;
        }
        seen.push(...result.items.map((item) => item.icao));
        page += 1;
      }

      expect(total).toBe(icaos.length);
      expect(seen).toHaveLength(icaos.length);
      expect(new Set(seen).size).toBe(icaos.length);
      // Ordenação por ICAO ascendente é o que sustenta a garantia.
      expect(seen).toEqual([...icaos].sort());
    });

    it("devolve o total do conjunto filtrado, não do acervo inteiro", async () => {
      await database.airports.save(airport({ icao: "SBGL", state: "RJ" }));
      await database.airports.save(airport({ icao: "SBRJ", state: "RJ" }));
      await database.airports.save(airport({ icao: "SBSP", state: "SP" }));

      const result = await database.airports.list({ page: 1, pageSize: 20, state: "RJ" });

      expect(result.total).toBe(2);
      expect(result.items.map((item) => item.icao)).toEqual(["SBGL", "SBRJ"]);
    });

    it("devolve página vazia além do fim, com o total correto", async () => {
      await saveAll(["SBGL", "SBSP"]);

      const result = await database.airports.list({ page: 9, pageSize: 20 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(2);
    });

    it("devolve acervo vazio sem erro", async () => {
      expect(await database.airports.list({ page: 1, pageSize: 20 })).toEqual({
        items: [],
        total: 0,
      });
    });

    it("encontra registro acentuado buscando pelo termo sem acento", async () => {
      await database.airports.save(
        airport({ icao: "SBGL", name: "Galeão - Antônio Carlos Jobim", city: "Rio de Janeiro" }),
      );
      await database.airports.save(
        airport({ icao: "SBSP", name: "Congonhas", city: "São Paulo", state: "SP" }),
      );

      const porNome = await database.airports.list({
        page: 1,
        pageSize: 20,
        search: normalizeSearchText("galeao"),
      });
      const porCidade = await database.airports.list({
        page: 1,
        pageSize: 20,
        search: normalizeSearchText("SAO PAULO"),
      });
      const porIcao = await database.airports.list({
        page: 1,
        pageSize: 20,
        search: normalizeSearchText("sbgl"),
      });

      expect(porNome.items.map((item) => item.icao)).toEqual(["SBGL"]);
      expect(porCidade.items.map((item) => item.icao)).toEqual(["SBSP"]);
      expect(porIcao.items.map((item) => item.icao)).toEqual(["SBGL"]);
    });

    it("encontra o mesmo registro com o termo acentuado, sem acento e em caixa alta", async () => {
      await database.airports.save(airport({ icao: "SBGL", name: "Galeão", city: "Rio" }));

      for (const termo of ["Galeão", "galeao", "GALEÃO", "Galeao"]) {
        const result = await database.airports.list({
          page: 1,
          pageSize: 20,
          search: normalizeSearchText(termo),
        });
        expect(result.items.map((item) => item.icao)).toEqual(["SBGL"]);
      }
    });

    it("combina filtro por UF e busca no mesmo critério", async () => {
      await database.airports.save(airport({ icao: "SBGL", name: "Galeão", state: "RJ" }));
      await database.airports.save(airport({ icao: "SBSP", name: "Galeão do Sul", state: "SP" }));

      const result = await database.airports.list({
        page: 1,
        pageSize: 20,
        state: "SP",
        search: normalizeSearchText("galeao"),
      });

      expect(result.items.map((item) => item.icao)).toEqual(["SBSP"]);
      expect(result.total).toBe(1);
    });

    it("não carrega pistas na listagem (FR-008)", async () => {
      await database.airports.save(
        airport({
          icao: "SBGL",
          runways: [{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }],
        }),
      );

      const result = await database.airports.list({ page: 1, pageSize: 20 });

      expect(result.items[0]).not.toHaveProperty("runways");
    });

    it("mantém a busca coerente depois de o aeródromo ser atualizado", async () => {
      await database.airports.save(airport({ icao: "SBGL", name: "Nome Antigo", city: "Rio" }));
      await database.airports.save(airport({ icao: "SBGL", name: "Galeão", city: "Rio" }));

      const antigo = await database.airports.list({
        page: 1,
        pageSize: 20,
        search: normalizeSearchText("antigo"),
      });
      const novo = await database.airports.list({
        page: 1,
        pageSize: 20,
        search: normalizeSearchText("galeao"),
      });

      expect(antigo.items).toEqual([]);
      expect(novo.items.map((item) => item.icao)).toEqual(["SBGL"]);
    });
  });

  describe("AirportProcedureRepository.findById", () => {
    function procedure(
      overrides: Partial<AirportProcedure> & Pick<AirportProcedure, "id">,
    ): AirportProcedure {
      return {
        airportIcao: "SBGL",
        name: `Carta ${overrides.id}`,
        type: "IAC",
        amendment: null,
        sourceUrl: null,
        storageKey: null,
        archivedAt: null,
        ...overrides,
      };
    }

    it("devolve o procedimento gravado", async () => {
      await database.airports.save(airport({ icao: "SBGL" }));
      await database.procedures.saveAll([
        procedure({ id: "p1", storageKey: "SBGL/p1.pdf", archivedAt: new Date() }),
      ]);

      const found = await database.procedures.findById("p1");

      expect(found?.id).toBe("p1");
      expect(found?.airportIcao).toBe("SBGL");
      expect(found?.storageKey).toBe("SBGL/p1.pdf");
      expect(found?.archivedAt).toBeInstanceOf(Date);
    });

    it("devolve null para id inexistente", async () => {
      expect(await database.procedures.findById("nao-existe")).toBeNull();
    });
  });

  describe("Database.ping", () => {
    it("resolve com o banco disponível", async () => {
      await expect(database.ping()).resolves.toBeUndefined();
    });

    it("sobrevive à queda de uma conexão ociosa em vez de derrubar o processo", async () => {
      // Regressão: sem listener de `error` no pool, o `terminating connection due
      // to administrator command` que o PostgreSQL envia ao reiniciar vira um
      // evento não tratado e mata o processo inteiro — a API precisa continuar no
      // ar e voltar a responder.
      const poolErrors: Error[] = [];
      const isolated = createDatabase({
        url: container.getConnectionUri(),
        onPoolError: (error) => poolErrors.push(error),
      });

      try {
        await isolated.ping();

        // Derruba as conexões ociosas pelo lado do servidor, como faz um reinício.
        const admin = new pg.Pool({ connectionString: container.getConnectionUri() });
        try {
          await admin.query(
            "select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state = 'idle'",
          );
        } finally {
          await admin.end();
        }

        // Dá tempo de o socket morto ser notado enquanto a conexão está ociosa —
        // é aí que o pool emite `error`, o evento que sem listener mata o
        // processo.
        await new Promise((resolve) => setTimeout(resolve, 250));

        // Conforme o momento, a falha aparece no evento do pool ou na própria
        // query; qualquer um serve, desde que o processo continue vivo e a
        // tentativa seguinte abra conexão nova e volte a passar. Uma rejeição
        // isolada é exatamente o `503 degraded` que a saúde deve reportar.
        const first = await isolated.ping().then(
          () => "ok",
          () => "falhou",
        );
        await expect(isolated.ping()).resolves.toBeUndefined();

        // Ao menos um dos dois caminhos precisa ter observado a queda; se nenhum
        // observou, o teste não exercitou o cenário e deixaria de proteger nada.
        expect(poolErrors.length > 0 || first === "falhou").toBe(true);
      } finally {
        await isolated.close();
      }
    });
  });

  describe("backfill da migração", () => {
    it("a normalização em SQL concorda com a em JavaScript", async () => {
      // Invariante do data-model §4: se divergirem, aeródromos gravados antes e
      // depois da migração respondem diferente à mesma busca. Aqui a linha entra
      // por SQL cru, sem passar por `saveAirportWith`, e é normalizada pela mesma
      // expressão que a migração usa.
      const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
      try {
        await pool.query(
          `insert into airport (icao, name, city, state) values ('SBCF', 'Tancredo Neves — Confins', 'Belo Horizonte', 'MG')`,
        );
        await pool.query(
          `update airport set search_text = translate(
             lower(icao || ' ' || name || ' ' || coalesce(city, '')),
             'áàâãäéèêëíìîïóòôõöúùûüçñ',
             'aaaaaeeeeiiiiooooouuuucn'
           ) where icao = 'SBCF'`,
        );

        const rows = await pool.query<{ search_text: string }>(
          "select search_text from airport where icao = 'SBCF'",
        );

        expect(rows.rows[0]?.search_text).toBe(
          normalizeSearchText("SBCF Tancredo Neves — Confins Belo Horizonte"),
        );
      } finally {
        await pool.end();
      }
    });
  });
});
