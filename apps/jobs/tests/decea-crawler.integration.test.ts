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

interface SourceRequests {
  catalog: number;
  charts: number;
  details: number;
  downloads: number;
}

/**
 * Fonte AISWEB simulada por um servidor HTTP local: o banco e o bucket são
 * reais, só as credenciais do DECEA (que não podem ser versionadas) saem do
 * caminho. Serve o catálogo e as cartas em lote, como a fonte real (research
 * R2, R3), e conta as requisições para provar o que o atalho economiza.
 */
function startFakeSource(options: {
  chartsByIcao: Readonly<Record<string, readonly string[]>>;
  /** Cartas publicadas para aeródromos que não constam do catálogo `AD`. */
  outsideCatalog?: Readonly<Record<string, readonly string[]>>;
  /** Aeródromos do catálogo cujo detalhamento vem vazio (`SI5J`, `SJZ1`). */
  withoutDetails?: readonly string[];
  /** Nº de respostas 503 no detalhamento antes de a fonte voltar — rede instável. */
  failFirstRequests?: number;
}): {
  server: Server;
  baseUrl: string;
  requests: SourceRequests;
} {
  const icaos = Object.keys(options.chartsByIcao);
  const requests: SourceRequests = { catalog: 0, charts: 0, details: 0, downloads: 0 };
  let remainingFailures = options.failFirstRequests ?? 0;

  const server = createServer((request, response) => {
    const host = request.headers.host ?? "localhost";
    const url = new URL(request.url ?? "/", `http://${host}`);

    if (url.pathname.startsWith("/download")) {
      requests.downloads += 1;
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end(Buffer.from("%PDF-1.7\ndocumento de teste\n%%EOF"));
      return;
    }

    const area = url.searchParams.get("area");
    const icao = url.searchParams.get("icaoCode");

    if (area === "rotaer" && icao !== null) {
      requests.details += 1;
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        response.writeHead(503, { "content-type": "text/plain" });
        response.end("fonte temporariamente indisponível");
        return;
      }
      response.writeHead(200, { "content-type": "text/xml; charset=utf-8" });
      if (options.withoutDetails?.includes(icao) === true) {
        response.end("<aisweb></aisweb>");
        return;
      }
      response.end(
        `<aisweb><AeroCode>${icao}</AeroCode><name><![CDATA[Aeródromo ${icao} — Ação]]></name>` +
          `<city><![CDATA[São Paulo]]></city><uf>SP</uf><lat>-22.81</lat><lng>-43.250555555556</lng>` +
          `<runways count="1"><runway><ident>10/28</ident><length>4000</length><width>45</width></runway></runways>` +
          `</aisweb>`,
      );
      return;
    }

    response.writeHead(200, { "content-type": "text/xml; charset=utf-8" });

    if (area === "cartas") {
      requests.charts += 1;
      const published = { ...options.chartsByIcao, ...options.outsideCatalog };
      const items = Object.entries(published).flatMap(([code, ids]) =>
        ids.map(
          (id) =>
            `<item id="${id}"><id>${id}</id><tipo>IAC</tipo><nome><![CDATA[RNP Y RWY 28]]></nome>` +
            // Sem <link>: o cliente recorre à URL derivada do id. Com o link, a
            // porta efêmera desta fonte mudaria entre execuções e a carta
            // pareceria alterada — coisa que a fonte real não faz.
            `<IcaoCode>${code}</IcaoCode><amdt>2601A1</amdt></item>`,
        ),
      );
      response.end(
        `<aisweb><cartas emenda="  2026-10-01  " lastupdate="  {ts '2026-09-30 17:35:34'}  " total="${items.length}">${items.join("")}</cartas></aisweb>`,
      );
      return;
    }

    requests.catalog += 1;
    const offset = Number(url.searchParams.get("rowstart") ?? "0");
    const limit = Number(url.searchParams.get("rowend") ?? "100");
    const page = icaos.slice(offset, offset + limit);
    response.end(
      `<aisweb><rotaer total="${icaos.length}">${page
        .map(
          (code) =>
            `<item><AeroCode>${code}</AeroCode><name><![CDATA[Aeródromo ${code} — Ação]]></name>` +
            `<city><![CDATA[São Paulo]]></city><uf>SP</uf><lng>-43.250555555556</lng><lat>-22.81</lat>` +
            `<dt>2026-09-10</dt></item>`,
        )
        .join("")}</rotaer></aisweb>`,
    );
  });

  server.listen(0);
  const port = (server.address() as AddressInfo).port;
  return { server, baseUrl: `http://127.0.0.1:${port}`, requests };
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
  let source: { server: Server; baseUrl: string; requests: SourceRequests };

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
      outsideCatalog?: Readonly<Record<string, readonly string[]>>;
      withoutDetails?: readonly string[];
    } = {},
  ): { job: DeceaCrawlerJob; report: RunReport; writer: SilentWriter; requests: SourceRequests } {
    source = startFakeSource({
      chartsByIcao,
      ...(options.failFirstRequests === undefined
        ? {}
        : { failFirstRequests: options.failFirstRequests }),
      ...(options.outsideCatalog === undefined ? {} : { outsideCatalog: options.outsideCatalog }),
      ...(options.withoutDetails === undefined ? {} : { withoutDetails: options.withoutDetails }),
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
    const archiver = new ChartArchiver({ client, storage });
    const skipDocuments = options.skipDocuments ?? false;

    const job = new DeceaCrawlerJob({
      client,
      processAirport: new ProcessAirport({
        client,
        repository: database.sync,
        archiver,
        report,
        clock,
        skipDocuments,
      }),
      archiver,
      snapshots: database.snapshots,
      syncState: database.syncState,
      sync: database.sync,
      retry: new RetryPolicy({ clock, random: Math.random, maxAttempts: 3, baseDelayMs: 10 }),
      progress: new ConsoleProgressReporter(writer),
      report,
      audit,
      clock,
      options: {
        pageSize: options.pageSize ?? 5000,
        concurrency: 4,
        only: options.only ?? [],
        force: false,
        revalidationDays: 7,
        revalidationBudget: 1000,
        skipDocuments,
      },
    });

    return { job, report, writer, requests: source.requests };
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
    expect(airport?.country).toBe("BR");
    expect(airport?.latitude).toBeCloseTo(-22.81, 6);
    expect(airport?.runways).toEqual([{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }]);

    const procedures = await database.procedures.listByAirport("SBGL");
    expect(procedures.map((item) => item.storageKey).sort()).toEqual([
      "SBGL/sbgl-c1.pdf",
      "SBGL/sbgl-c2.pdf",
    ]);
    expect(await storage.exists("SBGL/sbgl-c1.pdf")).toBe(true);
  });

  it("na segunda execução sem mudança não grava nem consulta o detalhamento", async () => {
    await buildJob({ SBGR: ["sbgr-c1"] }).job.run(new AbortController().signal);
    const before = await database.procedures.listByAirport("SBGR");

    const { job, report, requests } = buildJob({ SBGR: ["sbgr-c1"] });
    await job.run(new AbortController().signal);

    expect(requests).toEqual({ catalog: 1, charts: 1, details: 0, downloads: 0 });
    expect(report.totals.airportsUnchanged).toBe(1);
    expect(report.totals.documentsArchived).toBe(0);
    expect(await database.procedures.listByAirport("SBGR")).toEqual(before);
    // Reprocessar reescreve o mesmo país, sem duplicar o registro (FR-004). O
    // ICAO é a chave primária, então uma única linha por aeródromo é o próprio
    // enunciado da idempotência.
    expect((await database.airports.findByIcao("SBGR"))?.country).toBe("BR");
    expect(
      (await database.airports.listByState("SP")).filter((item) => item.icao === "SBGR"),
    ).toHaveLength(1);
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
    const { job, report, writer, requests } = buildJob(
      { SBCF: ["a"], SBPA: ["b"], SBCT: ["c"] },
      { pageSize: 2 },
    );

    await job.run(new AbortController().signal);

    // 3 aeródromos em páginas de 2 → 2 páginas, a última com um só.
    expect(requests.catalog).toBe(2);
    expect(writer.lines.some((line) => line.includes("Fonte lida: 3 aeródromos"))).toBe(true);
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

  it("não grava as cartas de aeródromos fora do catálogo", async () => {
    const { job, report } = buildJob(
      { SBRF: ["sbrf-c1"] },
      { outsideCatalog: { SBEN: ["sben-c1"] } },
    );

    await job.run(new AbortController().signal);

    expect(report.totals.chartsOutsideCatalog).toBe(1);
    expect(await database.procedures.findById("sben-c1")).toBeNull();
    expect(await database.procedures.findById("sbrf-c1")).not.toBeNull();
  });

  it("deixa fora da base o aeródromo sem detalhamento publicado", async () => {
    const { job, report } = buildJob({ SBMO: [], SI5J: [] }, { withoutDetails: ["SI5J"] });

    await job.run(new AbortController().signal);

    expect(report.failures.map((failure) => failure.icao)).toEqual(["SI5J"]);
    expect(await database.airports.findByIcao("SI5J")).toBeNull();
    expect(await database.airports.findByIcao("SBMO")).not.toBeNull();
  });

  it("emite o resumo final com os totais e a duração", async () => {
    const { job, report } = buildJob({ SBFL: ["sbfl-c1"] });

    await job.run(new AbortController().signal);
    const summary = report.format(new Date(report.startedAt.getTime() + 61_000));

    expect(summary).toContain("Duração total            : 1m1s");
    expect(summary).toContain(
      "Fonte                    : lastupdate 2026-09-30 17:35:34 · AIRAC 2026-10-01",
    );
    expect(summary).toContain("  gravados               : 1");
    expect(summary).toContain("Cartas persistidas       : 1");
    expect(summary).toContain("Tempo por etapa (soma das linhas de trabalho):");
  });
});
