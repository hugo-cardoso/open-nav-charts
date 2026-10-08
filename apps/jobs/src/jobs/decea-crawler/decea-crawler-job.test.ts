import type { IfrChartCatalog } from "@open-nav-charts/aisweb-client";
import { PermanentSourceError, RetryableSourceError } from "@open-nav-charts/aisweb-client";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../runtime/clock.js";
import { RetryPolicy } from "../../runtime/retry-policy.js";
import { RunReport } from "../../runtime/run-report.js";
import {
  airportDetails,
  catalogEntry,
  chart,
  FakeAirportSyncRepository,
  FakeAisWebClient,
  type FakeAisWebOptions,
  FakeChartStorage,
  FakeSourceSyncStateRepository,
  RecordingProgressReporter,
} from "../../testing/doubles.js";
import { ChartArchiver } from "./chart-archiver.js";
import { ChartTypeAudit } from "./chart-type-audit.js";
import { type CrawlerOptions, DeceaCrawlerJob } from "./decea-crawler-job.js";
import { ProcessAirport } from "./process-airport.js";

const DAY = 24 * 60 * 60 * 1000;

class ManualClock implements Clock {
  private current = new Date("2026-10-08T03:00:00Z");

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  async sleep(milliseconds: number): Promise<void> {
    this.advance(milliseconds);
  }
}

const runways = [{ ident: "10/28", lengthMeters: 1500, widthMeters: 30 }];

function ifrCharts(overrides: Partial<IfrChartCatalog> = {}): IfrChartCatalog {
  return { lastUpdate: "2026-09-30 17:35:34", airacCycle: "2026-10-01", charts: [], ...overrides };
}

/**
 * Fonte, base, bucket e relógio que sobrevivem entre execuções — é o que permite
 * verificar o que a segunda execução deixa de fazer.
 */
class World {
  readonly repository = new FakeAirportSyncRepository();
  readonly storage = new FakeChartStorage();
  readonly syncState = new FakeSourceSyncStateRepository();
  readonly clock = new ManualClock();
  source: FakeAisWebOptions;

  constructor(source: FakeAisWebOptions) {
    this.source = source;
  }

  build(options: Partial<CrawlerOptions> = {}, processAirport?: ProcessAirport) {
    const client = new FakeAisWebClient(this.source);
    const report = new RunReport(this.clock.now());
    const progress = new RecordingProgressReporter();
    const audit = new ChartTypeAudit();
    const archiver = new ChartArchiver({ client, storage: this.storage });
    const skipDocuments = options.skipDocuments ?? false;

    const job = new DeceaCrawlerJob({
      client,
      processAirport:
        processAirport ??
        new ProcessAirport({
          client,
          repository: this.repository,
          archiver,
          report,
          clock: this.clock,
          skipDocuments,
        }),
      archiver,
      snapshots: this.repository,
      syncState: this.syncState,
      sync: this.repository,
      retry: new RetryPolicy({
        clock: this.clock,
        random: () => 0,
        maxAttempts: 3,
        baseDelayMs: 1,
      }),
      progress,
      report,
      audit,
      clock: this.clock,
      options: {
        pageSize: 5000,
        concurrency: 4,
        only: [],
        force: false,
        revalidationDays: 7,
        revalidationBudget: 1000,
        skipDocuments,
        ...options,
      },
    });

    return { job, client, report, progress };
  }

  async run(options: Partial<CrawlerOptions> = {}) {
    const built = this.build(options);
    await built.job.run(new AbortController().signal);
    return built;
  }
}

function twoAirports(): FakeAisWebOptions {
  return {
    catalog: [catalogEntry({ icao: "SBGL" }), catalogEntry({ icao: "SBSP" })],
    airports: {
      SBGL: airportDetails({ icao: "SBGL", runways }),
      SBSP: airportDetails({ icao: "SBSP", runways }),
    },
    chartCatalog: ifrCharts({ charts: [chart({ id: "c1", airportIcao: "SBGL" })] }),
  };
}

describe("DeceaCrawlerJob", () => {
  it("expõe nome e descrição do subcomando", () => {
    const { job } = new World({}).build();

    expect(job.name).toBe("decea-crawler");
    expect(job.description).toContain("DECEA");
  });

  describe("atalho entre execuções (US1)", () => {
    it("na primeira execução grava todos os aeródromos, com pistas, cartas e documentos", async () => {
      const world = new World(twoAirports());

      const { client, report } = await world.run();

      expect(client.fetchedAirports.sort()).toEqual(["SBGL", "SBSP"]);
      expect(world.repository.calls).toHaveLength(2);
      expect(world.storage.putKeys).toEqual(["SBGL/c1.pdf"]);
      expect(report.totals.airportsSucceeded).toBe(2);
    });

    it("na segunda execução sem mudança na fonte não grava nada nem consulta detalhamento", async () => {
      const world = new World(twoAirports());
      await world.run();
      world.repository.calls.length = 0;
      world.clock.advance(DAY);

      const { client, report } = await world.run();

      expect(client.fetchedAirports).toEqual([]);
      expect(client.downloadedCharts).toEqual([]);
      expect(world.repository.calls).toEqual([]);
      expect(report.totals.airportsUnchanged).toBe(2);
    });

    it("usa as consultas em lote, e não uma consulta de cartas por aeródromo", async () => {
      const world = new World(twoAirports());

      const { client } = await world.run();

      expect(client.catalogRequests).toEqual([{ offset: 0, limit: 5000 }]);
      expect(client.chartCatalogRequests).toBe(1);
    });

    it("pagina o catálogo quando ele passa do tamanho de página", async () => {
      const world = new World({
        catalog: ["SBAA", "SBBB", "SBCC", "SBDD", "SBEE"].map((icao) => catalogEntry({ icao })),
        chartCatalog: ifrCharts(),
      });

      const { client } = await world.run({ pageSize: 2 });

      expect(client.catalogRequests.map((request) => request.offset)).toEqual([0, 2, 4]);
      expect(world.repository.calls).toHaveLength(5);
    });

    it("registra o indicador e o ciclo AIRAC do lote de cartas", async () => {
      const world = new World(twoAirports());

      await world.run();

      expect(world.syncState.observations[0]?.value).toEqual({
        lastUpdate: "2026-09-30 17:35:34",
        airacCycle: "2026-10-01",
      });
    });

    it("revalida as pistas de todos quando o ciclo AIRAC muda, marcando em lote os que não mudaram", async () => {
      const world = new World(twoAirports());
      await world.run();
      world.repository.calls.length = 0;
      world.clock.advance(DAY);
      world.source = {
        ...world.source,
        chartCatalog: ifrCharts({
          airacCycle: "2026-10-29",
          charts: [chart({ id: "c1", airportIcao: "SBGL" })],
        }),
      };

      const { client } = await world.run();

      expect(client.fetchedAirports.sort()).toEqual(["SBGL", "SBSP"]);
      expect(world.repository.calls).toEqual([]);
      expect(world.repository.markedChecks.map((check) => check.icao).sort()).toEqual([
        "SBGL",
        "SBSP",
      ]);
    });

    it("grava só o aeródromo cujo cadastro mudou, sem consultar o detalhamento", async () => {
      const world = new World(twoAirports());
      await world.run();
      world.repository.calls.length = 0;
      world.clock.advance(DAY);
      world.source = {
        ...world.source,
        catalog: [
          catalogEntry({ icao: "SBGL", name: "Novo nome" }),
          catalogEntry({ icao: "SBSP" }),
        ],
      };

      const { client } = await world.run();

      expect(client.fetchedAirports).toEqual([]);
      expect(world.repository.calls.map((call) => call.airport.name)).toEqual(["Novo nome"]);
    });

    it("baixa de novo o documento que sumiu do bucket", async () => {
      const world = new World(twoAirports());
      await world.run();
      world.storage.objects.clear();

      const { client } = await world.run();

      expect(client.downloadedCharts).toEqual(["c1"]);
    });

    it("mantém pendente na execução seguinte o aeródromo cujo detalhamento falhou", async () => {
      let attempts = 0;
      const world = new World({
        catalog: [catalogEntry({ icao: "SI5J" })],
        airports: {
          SI5J: () => {
            attempts += 1;
            throw new PermanentSourceError("a fonte não publica detalhamento");
          },
        },
        chartCatalog: ifrCharts(),
      });

      const first = await world.run();
      world.clock.advance(DAY);
      await world.run();

      expect(attempts).toBe(2);
      expect(first.report.failures.map((failure) => failure.icao)).toEqual(["SI5J"]);
      expect(world.repository.calls).toEqual([]);
    });

    it("revalida todos em --force", async () => {
      const world = new World(twoAirports());
      await world.run();
      world.repository.calls.length = 0;

      const { client } = await world.run({ force: true });

      expect(client.fetchedAirports.sort()).toEqual(["SBGL", "SBSP"]);
    });

    it("restringe a --only e registra como falha o ICAO fora do catálogo", async () => {
      const world = new World(twoAirports());

      const { client, report } = await world.run({ only: ["SBSP", "SBEN"] });

      expect(client.fetchedAirports).toEqual(["SBSP"]);
      expect(world.repository.calls.map((call) => call.airport.icao)).toEqual(["SBSP"]);
      expect(report.failures).toEqual([
        { icao: "SBEN", reason: "não consta no catálogo AD da fonte" },
      ]);
    });

    it("não grava cartas de aeródromos fora do catálogo", async () => {
      const world = new World({
        ...twoAirports(),
        chartCatalog: ifrCharts({
          charts: [
            chart({ id: "c1", airportIcao: "SBGL" }),
            chart({ id: "x1", airportIcao: "SBEN" }),
          ],
        }),
      });

      const { report } = await world.run();

      const procedures = world.repository.calls.flatMap((call) => call.procedures);
      expect(procedures.map((procedure) => procedure.id)).toEqual(["c1"]);
      expect(report.totals.chartsOutsideCatalog).toBe(1);
    });
  });

  describe("falhas e tentativas", () => {
    it("encerra sem gravar nada quando o lote de cartas falha em definitivo", async () => {
      const world = new World({
        ...twoAirports(),
        chartCatalog: () => {
          throw new PermanentSourceError("XML malformado");
        },
      });

      await expect(world.build().job.run(new AbortController().signal)).rejects.toBeInstanceOf(
        PermanentSourceError,
      );
      expect(world.repository.calls).toEqual([]);
      expect(world.syncState.observations).toEqual([]);
    });

    it("repete o lote de cartas em erro retentável", async () => {
      let attempts = 0;
      const world = new World({
        ...twoAirports(),
        chartCatalog: () => {
          attempts += 1;
          if (attempts < 2) {
            throw new RetryableSourceError("lote truncado");
          }
          return ifrCharts();
        },
      });

      await world.run();

      expect(attempts).toBe(2);
      expect(world.repository.calls).toHaveLength(2);
    });

    it("repete o aeródromo em erro retentável e registra o sucesso", async () => {
      let attempts = 0;
      const world = new World({
        catalog: [catalogEntry({ icao: "SBGL" })],
        airports: {
          SBGL: () => {
            attempts += 1;
            if (attempts < 3) {
              throw new RetryableSourceError("timeout");
            }
            return airportDetails({ icao: "SBGL" });
          },
        },
        chartCatalog: ifrCharts(),
      });

      const { report, progress } = await world.run();

      expect(attempts).toBe(3);
      expect(report.totals.airportsSucceeded).toBe(1);
      expect(progress.lines.filter((line) => line.startsWith("retry SBGL"))).toHaveLength(2);
    });

    it("não interrompe a varredura quando um aeródromo falha em definitivo", async () => {
      const world = new World({
        ...twoAirports(),
        airports: {
          SBGL: () => {
            throw new PermanentSourceError("XML malformado");
          },
        },
      });

      const { report, progress } = await world.run();

      expect(report.totals.airportsFailed).toBe(1);
      expect(report.totals.airportsSucceeded).toBe(1);
      expect(progress.lines.some((line) => line.startsWith("fail SBGL"))).toBe(true);
    });

    it("para de iniciar aeródromos novos após a interrupção", async () => {
      const world = new World({
        catalog: ["SBAA", "SBBB", "SBCC"].map((icao) => catalogEntry({ icao })),
        chartCatalog: ifrCharts(),
      });
      const controller = new AbortController();
      const processed: string[] = [];
      const processAirport = {
        execute: async (plan: { entry: { icao: string; name: string } }) => {
          processed.push(plan.entry.icao);
          controller.abort();
          return {
            icao: plan.entry.icao,
            name: plan.entry.name,
            result: "written",
            runwaysCheck: null,
            proceduresPersisted: 0,
            documentsArchived: 0,
            documentsAlreadyPresent: 0,
            documentsRemoved: 0,
          };
        },
      } as unknown as ProcessAirport;
      const { job, progress } = world.build({ concurrency: 1 }, processAirport);

      await job.run(controller.signal);

      expect(processed).toEqual(["SBAA"]);
      expect(progress.lines).toContain("interrupted");
    });
  });

  describe("relatório", () => {
    it("devolve o relatório acumulado ao término", async () => {
      const world = new World(twoAirports());
      const { job, report } = world.build();

      const result = await job.run(new AbortController().signal);

      expect(result).toBe(report);
      expect(result.totals.proceduresPersisted).toBe(1);
      expect(result.totals.documentsArchived).toBe(1);
    });

    it("registra o tempo de cada etapa e o indicador observado", async () => {
      const world = new World(twoAirports());
      // Cada leitura do relógio avança 10 ms: toda etapa medida passa a ter duração.
      const now = world.clock.now.bind(world.clock);
      world.clock.now = () => {
        world.clock.advance(10);
        return now();
      };

      const { report } = await world.run();

      expect(Object.keys(report.phaseDurations).sort()).toEqual([
        "catalog",
        "charts",
        "database",
        "documents",
        "runways",
      ]);
      for (const milliseconds of Object.values(report.phaseDurations)) {
        expect(milliseconds).toBeGreaterThan(0);
      }
      expect(report.format(world.clock.now())).toContain("AIRAC 2026-10-01");
    });

    it("conta como falha de aeródromo, para o total do catálogo, o detalhamento que falhou", async () => {
      const world = new World({
        ...twoAirports(),
        airports: {
          SBGL: () => {
            throw new PermanentSourceError("XML malformado");
          },
        },
      });

      const { report } = await world.run();

      const totals = report.totals;
      expect(totals.airportsWritten + totals.airportsUnchanged + totals.airportsFailed).toBe(2);
    });

    it("resume a distribuição de tipos desconhecidos no relatório", async () => {
      const world = new World({
        ...twoAirports(),
        chartCatalog: ifrCharts({ charts: [chart({ id: "c1", type: "NOVO" })] }),
      });

      const { report } = await world.run();

      expect(report.warnings.join("\n")).toContain("NOVO");
    });
  });

  describe("eficiência (US2)", () => {
    function manyAirports(count: number): FakeAisWebOptions {
      return {
        catalog: Array.from({ length: count }, (_, index) =>
          catalogEntry({ icao: `SB${String.fromCharCode(65 + index)}A` }),
        ),
        chartCatalog: ifrCharts(),
        delayMs: 1,
      };
    }

    it("nunca tem mais de 4 requisições à fonte em voo", async () => {
      const world = new World(manyAirports(20));

      const { client } = await world.run({ concurrency: 4 });

      expect(client.fetchedAirports).toHaveLength(20);
      expect(client.peakInFlight).toBe(4);
    });

    it("não espera o aeródromo lento para começar os seguintes", async () => {
      const world = new World(manyAirports(6));
      const built = world.build({ concurrency: 2 });
      // O primeiro aeródromo demora mais que os outros cinco juntos.
      const slowIcao = "SBAA";
      const fetchAirport = built.client.fetchAirport.bind(built.client);
      built.client.fetchAirport = async (icao: string) => {
        if (icao === slowIcao) {
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        return fetchAirport(icao);
      };

      await built.job.run(new AbortController().signal);

      const finished = built.progress.lines
        .filter((line) => line.startsWith("ok "))
        .map((line) => line.split(" ")[1]);
      expect(finished).toHaveLength(6);
      expect(finished.at(-1)).toBe(slowIcao);
    });

    it("lê catálogo e cartas em paralelo", async () => {
      const world = new World({ catalog: [], chartCatalog: ifrCharts(), delayMs: 5 });

      const { client } = await world.run();

      expect(client.peakInFlight).toBe(2);
    });

    it("lista o bucket uma vez e não verifica documento por documento", async () => {
      const world = new World(twoAirports());

      await world.run();

      expect(world.storage.listKeysCalls).toBe(1);
      expect(world.storage.existsCalls).toBe(0);
    });

    it("não lista o bucket em --skip-documents", async () => {
      const world = new World(twoAirports());

      await world.run({ skipDocuments: true });

      expect(world.storage.listKeysCalls).toBe(0);
      expect(world.storage.putKeys).toEqual([]);
    });
  });
});
