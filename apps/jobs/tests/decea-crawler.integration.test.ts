import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { HttpAisWebClient } from "@open-nav-charts/aisweb-client";
import { createDatabase, type Database, runMigrations } from "@open-nav-charts/domain";
import { createChartStorage, type ManagedChartStorage } from "@open-nav-charts/object-storage";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChartArchiver } from "../src/jobs/decea-crawler/chart-archiver.js";
import { ChartTypeAudit } from "../src/jobs/decea-crawler/chart-type-audit.js";
import { DeceaCrawlerJob } from "../src/jobs/decea-crawler/decea-crawler-job.js";
import { ProcessAirport } from "../src/jobs/decea-crawler/process-airport.js";
import { SystemClock } from "../src/runtime/clock.js";
import { ConsoleProgressReporter, type OutputWriter } from "../src/runtime/progress-reporter.js";
import { RetryPolicy } from "../src/runtime/retry-policy.js";
import { RunReport } from "../src/runtime/run-report.js";

const BUCKET = "onc-charts";
const CREDENTIALS = { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" } as const;

/**
 * Fonte AISWEB simulada por um servidor HTTP local: o banco e o bucket são
 * reais, só as credenciais do DECEA (que não podem ser versionadas) saem do
 * caminho. É o que permite validar o pipeline completo sem rede externa.
 */
function startFakeSource(options: {
  chartsByIcao: Readonly<Record<string, readonly string[]>>;
  /** Nº de respostas 503 antes de a fonte voltar — simula rede instável. */
  failFirstRequests?: number;
}): {
  server: Server;
  baseUrl: string;
} {
  const icaos = Object.keys(options.chartsByIcao);
  let remainingFailures = options.failFirstRequests ?? 0;

  const server = createServer((request, response) => {
    const host = request.headers.host ?? "localhost";
    const url = new URL(request.url ?? "/", `http://${host}`);

    if (remainingFailures > 0 && url.searchParams.get("icaoCode") !== null) {
      remainingFailures -= 1;
      response.writeHead(503, { "content-type": "text/plain" });
      response.end("fonte temporariamente indisponível");
      return;
    }

    if (url.pathname.startsWith("/download")) {
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end(Buffer.from("%PDF-1.7\ndocumento de teste\n%%EOF"));
      return;
    }

    const area = url.searchParams.get("area");
    const icao = url.searchParams.get("icaoCode");
    response.writeHead(200, { "content-type": "text/xml; charset=utf-8" });

    if (area === "cartas" && icao !== null) {
      const ids = options.chartsByIcao[icao] ?? [];
      response.end(
        `<aisweb><cartas emenda="2026-08-06" total="${ids.length}">${ids
          .map(
            (id) =>
              `<item id="${id}"><id>${id}</id><tipo>IAC</tipo><nome><![CDATA[RNP Y RWY 28]]></nome>` +
              `<IcaoCode>${icao}</IcaoCode>` +
              `<link><![CDATA[http://${host}/download/?arquivo=${id}&amp;apikey=k]]></link>` +
              `<amdt>2601A1</amdt></item>`,
          )
          .join("")}</cartas></aisweb>`,
      );
      return;
    }

    if (icao !== null) {
      response.end(
        `<aisweb><AeroCode>${icao}</AeroCode><name><![CDATA[Aeródromo ${icao} — Ação]]></name>` +
          `<city><![CDATA[São Paulo]]></city><uf>SP</uf><lat>-22.81</lat><lng>-43.250555555556</lng>` +
          `<runways count="1"><runway><ident>10/28</ident><length>4000</length><width>45</width></runway></runways>` +
          `</aisweb>`,
      );
      return;
    }

    const offset = Number(url.searchParams.get("rowstart") ?? "0");
    const limit = Number(url.searchParams.get("rowend") ?? "100");
    const page = icaos.slice(offset, offset + limit);
    response.end(
      `<aisweb><rotaer total="${icaos.length}">${page
        .map((code) => `<item><AeroCode>${code}</AeroCode></item>`)
        .join("")}</rotaer></aisweb>`,
    );
  });

  server.listen(0);
  const port = (server.address() as AddressInfo).port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

class SilentWriter implements OutputWriter {
  readonly lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }
}

describe("decea-crawler (integração ponta a ponta)", () => {
  let postgres: StartedPostgreSqlContainer;
  let minio: StartedTestContainer;
  let database: Database;
  let storage: ManagedChartStorage;
  let source: { server: Server; baseUrl: string };

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17-alpine").start();
    minio = await new GenericContainer("minio/minio:latest")
      .withCommand(["server", "/data"])
      .withEnvironment({
        MINIO_ROOT_USER: CREDENTIALS.accessKeyId,
        MINIO_ROOT_PASSWORD: CREDENTIALS.secretAccessKey,
      })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
      .start();

    await runMigrations({ url: postgres.getConnectionUri() });
    database = createDatabase({ url: postgres.getConnectionUri() });

    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    const admin = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { ...CREDENTIALS },
    });
    await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));
    admin.destroy();

    storage = createChartStorage({
      endpoint,
      region: "us-east-1",
      accessKeyId: CREDENTIALS.accessKeyId,
      secretAccessKey: CREDENTIALS.secretAccessKey,
      bucket: BUCKET,
      forcePathStyle: true,
    });
  }, 180_000);

  afterAll(async () => {
    source?.server.close();
    storage?.close();
    await database?.close();
    await minio?.stop();
    await postgres?.stop();
  });

  beforeEach(() => {
    source?.server.close();
  });

  function buildJob(
    chartsByIcao: Readonly<Record<string, readonly string[]>>,
    options: {
      skipDocuments?: boolean;
      pageSize?: number;
      only?: readonly string[];
      failFirstRequests?: number;
    } = {},
  ): { job: DeceaCrawlerJob; report: RunReport; writer: SilentWriter } {
    source = startFakeSource({
      chartsByIcao,
      ...(options.failFirstRequests === undefined
        ? {}
        : { failFirstRequests: options.failFirstRequests }),
    });

    const client = new HttpAisWebClient({
      apiKey: "chave",
      apiPass: "senha",
      fetch: globalThis.fetch,
      baseUrl: `${source.baseUrl}/api/`,
      downloadUrl: `${source.baseUrl}/download/`,
    });
    const clock = new SystemClock();
    const report = new RunReport(clock.now());
    const writer = new SilentWriter();
    const audit = new ChartTypeAudit();

    const job = new DeceaCrawlerJob({
      client,
      processAirport: new ProcessAirport({
        client,
        repository: database.sync,
        archiver: new ChartArchiver({ client, storage }),
        audit,
        report,
        skipDocuments: options.skipDocuments ?? false,
      }),
      retry: new RetryPolicy({ clock, random: Math.random, maxAttempts: 3, baseDelayMs: 10 }),
      progress: new ConsoleProgressReporter(writer),
      report,
      audit,
      clock,
      options: {
        pageSize: options.pageSize ?? 100,
        concurrency: 4,
        only: options.only ?? [],
      },
    });

    return { job, report, writer };
  }

  it("coleta aeródromo, cartas e documentos ponta a ponta", async () => {
    const { job, report } = buildJob({ SBGL: ["sbgl-c1", "sbgl-c2"] });

    await job.run(new AbortController().signal);

    expect(report.totals.airportsSucceeded).toBe(1);
    expect(report.totals.proceduresPersisted).toBe(2);
    expect(report.totals.documentsArchived).toBe(2);
    expect(report.hasFailures).toBe(false);

    const airport = await database.airports.findByIcao("SBGL");
    expect(airport?.name).toBe("Aeródromo SBGL — Ação");
    expect(airport?.latitude).toBeCloseTo(-22.81, 6);
    expect(airport?.runways).toEqual([{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }]);

    const procedures = await database.procedures.listByAirport("SBGL");
    expect(procedures.map((item) => item.storageKey).sort()).toEqual([
      "SBGL/sbgl-c1.pdf",
      "SBGL/sbgl-c2.pdf",
    ]);
    expect(await storage.exists("SBGL/sbgl-c1.pdf")).toBe(true);
  });

  it("é idempotente: reexecutar não duplica e reaproveita o documento arquivado", async () => {
    await buildJob({ SBGR: ["sbgr-c1"] }).job.run(new AbortController().signal);

    const { job, report } = buildJob({ SBGR: ["sbgr-c1"] });
    await job.run(new AbortController().signal);

    expect(report.totals.documentsArchived).toBe(0);
    expect(report.totals.documentsAlreadyPresent).toBe(1);
    expect(await database.procedures.listByAirport("SBGR")).toHaveLength(1);
  });

  it("remove do banco e do bucket a carta que saiu de vigência", async () => {
    await buildJob({ SBSP: ["sbsp-c1", "sbsp-antiga"] }).job.run(new AbortController().signal);
    expect(await storage.exists("SBSP/sbsp-antiga.pdf")).toBe(true);

    const { job, report } = buildJob({ SBSP: ["sbsp-c1"] });
    await job.run(new AbortController().signal);

    expect(report.totals.documentsRemoved).toBe(1);
    expect((await database.procedures.listByAirport("SBSP")).map((item) => item.id)).toEqual([
      "sbsp-c1",
    ]);
    expect(await storage.exists("SBSP/sbsp-antiga.pdf")).toBe(false);
  });

  it("com --skip-documents persiste metadados sem tocar no bucket", async () => {
    const { job, report } = buildJob({ SBBR: ["sbbr-c1"] }, { skipDocuments: true });

    await job.run(new AbortController().signal);

    expect(report.totals.proceduresPersisted).toBe(1);
    expect(report.totals.documentsArchived).toBe(0);
    expect((await database.procedures.listByAirport("SBBR"))[0]?.storageKey).toBeNull();
    expect(await storage.exists("SBBR/sbbr-c1.pdf")).toBe(false);
  });

  it("percorre todas as páginas, incluindo a última parcial", async () => {
    const { job, report, writer } = buildJob(
      { SBCF: ["a"], SBPA: ["b"], SBCT: ["c"] },
      { pageSize: 2 },
    );

    await job.run(new AbortController().signal);

    // 3 aeródromos em páginas de 2 → 2 páginas, a última com um só.
    expect(writer.lines[0]).toContain("3 aeródromos em 2 páginas");
    expect(report.totals.airportsSucceeded).toBe(3);
    expect(await database.airports.findByIcao("SBCT")).not.toBeNull();
  });

  it("retoma o aeródromo após falha transitória da fonte", async () => {
    // Duas respostas 503 e a fonte volta: o aeródromo conclui na 3ª tentativa,
    // sem perda de dado (FR-021, cenário 6 do quickstart).
    const { job, report, writer } = buildJob({ SBSV: ["sbsv-c1"] }, { failFirstRequests: 2 });

    await job.run(new AbortController().signal);

    expect(report.totals.airportsSucceeded).toBe(1);
    expect(report.hasFailures).toBe(false);
    expect(writer.lines.filter((line) => line.includes("tentativa"))).toHaveLength(2);
    expect(writer.lines.some((line) => line.includes("tentativa 2/3"))).toBe(true);
    expect(await database.airports.findByIcao("SBSV")).not.toBeNull();
  });

  it("marca o aeródromo como falho quando as 3 tentativas se esgotam", async () => {
    const { job, report, writer } = buildJob({ SBBE: ["sbbe-c1"] }, { failFirstRequests: 99 });

    await job.run(new AbortController().signal);

    expect(report.totals.airportsFailed).toBe(1);
    expect(report.failures[0]?.icao).toBe("SBBE");
    expect(writer.lines.some((line) => line.includes("FALHA"))).toBe(true);
    expect(await database.airports.findByIcao("SBBE")).toBeNull();
  });

  it("emite o resumo final com os totais e a duração", async () => {
    const { job, report } = buildJob({ SBFL: ["sbfl-c1"] });

    await job.run(new AbortController().signal);
    const summary = report.format(new Date(report.startedAt.getTime() + 61_000));

    expect(summary).toContain("Aeródromos processados : 1");
    expect(summary).toContain("Cartas persistidas     : 1");
    expect(summary).toContain("Duração                : 1m1s");
  });
});
