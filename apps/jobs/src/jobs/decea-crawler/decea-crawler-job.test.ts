import { PermanentSourceError, RetryableSourceError } from "@open-nav-charts/aisweb-client";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../runtime/clock.js";
import { RetryPolicy } from "../../runtime/retry-policy.js";
import { RunReport } from "../../runtime/run-report.js";
import {
  airportDetails,
  chart,
  FakeAirportSyncRepository,
  FakeAisWebClient,
  type FakeAisWebOptions,
  FakeChartStorage,
  RecordingProgressReporter,
} from "../../testing/doubles.js";
import { ChartArchiver } from "./chart-archiver.js";
import { ChartTypeAudit } from "./chart-type-audit.js";
import { DeceaCrawlerJob } from "./decea-crawler-job.js";
import { ProcessAirport } from "./process-airport.js";

class InstantClock implements Clock {
  private current = new Date("2026-08-15T10:00:00Z");

  now(): Date {
    return new Date(this.current);
  }

  async sleep(milliseconds: number): Promise<void> {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

function build(
  sourceOptions: FakeAisWebOptions,
  jobOptions: {
    pageSize?: number;
    concurrency?: number;
    maxAttempts?: number;
    only?: readonly string[];
    processAirport?: ProcessAirport;
  } = {},
) {
  const client = new FakeAisWebClient(sourceOptions);
  const repository = new FakeAirportSyncRepository();
  const storage = new FakeChartStorage();
  const clock = new InstantClock();
  const report = new RunReport(clock.now());
  const progress = new RecordingProgressReporter();
  const audit = new ChartTypeAudit();

  const processAirport =
    jobOptions.processAirport ??
    new ProcessAirport({
      client,
      repository,
      archiver: new ChartArchiver({ client, storage }),
      audit,
      report,
      skipDocuments: false,
    });

  const job = new DeceaCrawlerJob({
    client,
    processAirport,
    retry: new RetryPolicy({
      clock,
      random: () => 0,
      maxAttempts: jobOptions.maxAttempts ?? 3,
      baseDelayMs: 1,
    }),
    progress,
    report,
    audit,
    clock,
    options: {
      pageSize: jobOptions.pageSize ?? 100,
      concurrency: jobOptions.concurrency ?? 4,
      only: jobOptions.only ?? [],
    },
  });

  return { job, client, repository, storage, report, progress, audit };
}

describe("DeceaCrawlerJob", () => {
  it("expõe nome e descrição do subcomando", () => {
    const { job } = build({ icaosByPage: [[]] });

    expect(job.name).toBe("decea-crawler");
    expect(job.description).toContain("DECEA");
  });

  it("percorre todas as páginas, inclusive a última parcial", async () => {
    const { job, client } = build(
      { total: 5, icaosByPage: [["A1", "A2"], ["B1", "B2"], ["C1"]] },
      { pageSize: 2 },
    );

    await job.run(new AbortController().signal);

    expect(client.fetchedAirports).toEqual(["A1", "A2", "B1", "B2", "C1"]);
  });

  it("encerra a paginação em página vazia mesmo com total maior", async () => {
    // Protege contra catálogo que muda durante a varredura e contra laço infinito.
    const { job, client } = build({ total: 1000, icaosByPage: [["A1"], []] }, { pageSize: 1 });

    await job.run(new AbortController().signal);

    expect(client.fetchedAirports).toEqual(["A1"]);
  });

  it("respeita o limite de concorrência dentro da página", async () => {
    let active = 0;
    let peak = 0;
    const processAirport = {
      execute: async (icao: string) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setImmediate(resolve));
        active -= 1;
        return {
          icao,
          name: icao,
          proceduresPersisted: 0,
          documentsArchived: 0,
          documentsAlreadyPresent: 0,
          documentsRemoved: 0,
        };
      },
    } as unknown as ProcessAirport;
    const { job } = build(
      { total: 12, icaosByPage: [["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]] },
      { pageSize: 12, concurrency: 4, processAirport },
    );

    await job.run(new AbortController().signal);

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBe(4);
  });

  it("não interrompe a varredura quando um aeródromo falha em definitivo", async () => {
    const { job, client, report } = build(
      {
        total: 3,
        icaosByPage: [["SBGR", "SBXX", "SBSP"]],
        airports: {
          SBXX: () => {
            throw new PermanentSourceError("XML malformado");
          },
        },
      },
      { pageSize: 3, concurrency: 1 },
    );

    const result = await job.run(new AbortController().signal);

    expect(client.fetchedAirports).toEqual(["SBGR", "SBXX", "SBSP"]);
    expect(result.totals.airportsSucceeded).toBe(2);
    expect(result.totals.airportsFailed).toBe(1);
    expect(report.failures[0]?.icao).toBe("SBXX");
  });

  it("repete o aeródromo em erro retentável e registra o sucesso", async () => {
    let attempts = 0;
    const { job, report, progress } = build(
      {
        total: 1,
        icaosByPage: [["SBGL"]],
        airports: {
          SBGL: () => {
            attempts += 1;
            if (attempts < 3) {
              throw new RetryableSourceError("timeout");
            }
            return airportDetails({ icao: "SBGL" });
          },
        },
      },
      { pageSize: 1 },
    );

    await job.run(new AbortController().signal);

    expect(attempts).toBe(3);
    expect(report.totals.airportsSucceeded).toBe(1);
    expect(progress.lines.filter((line) => line.startsWith("retry"))).toHaveLength(2);
  });

  it("registra a falha após esgotar as 3 tentativas", async () => {
    const { job, report, progress } = build(
      {
        total: 1,
        icaosByPage: [["SBXX"]],
        airports: {
          SBXX: () => {
            throw new RetryableSourceError("timeout");
          },
        },
      },
      { pageSize: 1 },
    );

    const result = await job.run(new AbortController().signal);

    expect(result.totals.airportsFailed).toBe(1);
    expect(report.failures[0]?.reason).toContain("timeout");
    expect(progress.lines.some((line) => line.startsWith("fail SBXX"))).toBe(true);
  });

  it("restringe a varredura aos ICAOs de --only, sem paginar", async () => {
    const { job, client } = build(
      { total: 4550, icaosByPage: [["A1", "A2"]] },
      { only: ["SBGL", "SBGR"] },
    );

    await job.run(new AbortController().signal);

    expect(client.fetchedAirports).toEqual(["SBGL", "SBGR"]);
  });

  it("reporta início com total, páginas e concorrência", async () => {
    const { job, progress } = build(
      { total: 5, icaosByPage: [["A1", "A2"], ["B1"]] },
      {
        pageSize: 2,
        concurrency: 4,
      },
    );

    await job.run(new AbortController().signal);

    expect(progress.lines[0]).toBe("start 5 3 4");
  });

  it("emite progresso por página e por aeródromo", async () => {
    const { job, progress } = build(
      {
        total: 1,
        icaosByPage: [["SBGL"]],
        airports: { SBGL: airportDetails({ icao: "SBGL", name: "Galeão" }) },
        charts: { SBGL: [chart({ id: "c1" })] },
      },
      { pageSize: 1 },
    );

    await job.run(new AbortController().signal);

    expect(progress.lines).toContain("page-start 1/1");
    expect(progress.lines).toContain("ok SBGL Galeão 1");
    expect(progress.lines.some((line) => line.startsWith("page-end 1/1"))).toBe(true);
  });

  it("para de iniciar aeródromos novos após a interrupção", async () => {
    const controller = new AbortController();
    const processed: string[] = [];
    const processAirport = {
      execute: async (icao: string) => {
        processed.push(icao);
        controller.abort();
        return {
          icao,
          name: icao,
          proceduresPersisted: 0,
          documentsArchived: 0,
          documentsAlreadyPresent: 0,
          documentsRemoved: 0,
        };
      },
    } as unknown as ProcessAirport;
    const { job, progress } = build(
      {
        total: 4,
        icaosByPage: [
          ["A", "B"],
          ["C", "D"],
        ],
      },
      { pageSize: 2, concurrency: 1, processAirport },
    );

    await job.run(controller.signal);

    expect(processed).toEqual(["A"]);
    expect(progress.lines).toContain("interrupted");
  });

  it("devolve o relatório acumulado ao término", async () => {
    const { job, report } = build(
      {
        total: 1,
        icaosByPage: [["SBGL"]],
        charts: { SBGL: [chart({ id: "c1" }), chart({ id: "c2" })] },
      },
      { pageSize: 1 },
    );

    const result = await job.run(new AbortController().signal);

    expect(result).toBe(report);
    expect(result.totals.proceduresPersisted).toBe(2);
    expect(result.totals.documentsArchived).toBe(2);
  });

  it("resume a distribuição de tipos desconhecidos no relatório", async () => {
    const { job, report } = build(
      {
        total: 1,
        icaosByPage: [["SBGL"]],
        charts: { SBGL: [chart({ id: "c1", type: "NOVO" })] },
      },
      { pageSize: 1 },
    );

    await job.run(new AbortController().signal);

    expect(report.warnings.join("\n")).toContain("NOVO");
  });
});
