import type { AirportCatalogEntry, ChartSummary } from "@open-nav-charts/aisweb-client";
import { BRAZIL_COUNTRY_CODE, PermanentSourceError } from "@open-nav-charts/aisweb-client";
import type { AirportSnapshot } from "@open-nav-charts/domain";
import { beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../../runtime/clock.js";
import { RunReport } from "../../runtime/run-report.js";
import {
  airportDetails,
  catalogEntry,
  chart,
  FakeAirportSyncRepository,
  FakeAisWebClient,
  type FakeAisWebOptions,
  FakeChartStorage,
  pdfBytes,
} from "../../testing/doubles.js";
import { toAirport, toProcedure } from "./airport-comparison.js";
import { ChartArchiver } from "./chart-archiver.js";
import { ProcessAirport } from "./process-airport.js";
import type { AirportPlan, RunwaysReason, WriteReason } from "./sync-planner.js";

const NOW = new Date("2026-10-08T12:00:00Z");

class FixedClock implements Clock {
  now(): Date {
    return new Date(NOW);
  }

  async sleep(): Promise<void> {}
}

const runways = [{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }];
const sbgl = catalogEntry({ icao: "SBGL", name: "Galeão", updatedOn: "2026-09-10" });

interface Harness {
  readonly client: FakeAisWebClient;
  readonly repository: FakeAirportSyncRepository;
  readonly storage: FakeChartStorage;
  readonly report: RunReport;
  readonly useCase: ProcessAirport;
}

function harness(
  options: FakeAisWebOptions = {},
  overrides: {
    repository?: FakeAirportSyncRepository;
    storage?: FakeChartStorage;
    skipDocuments?: boolean;
  } = {},
): Harness {
  const client = new FakeAisWebClient({
    airports: { SBGL: airportDetails({ icao: "SBGL", runways }) },
    ...options,
  });
  const repository = overrides.repository ?? new FakeAirportSyncRepository();
  const storage = overrides.storage ?? new FakeChartStorage();
  const report = new RunReport(NOW);

  return {
    client,
    repository,
    storage,
    report,
    useCase: new ProcessAirport({
      client,
      repository,
      archiver: new ChartArchiver({ client, storage }),
      report,
      clock: new FixedClock(),
      skipDocuments: overrides.skipDocuments ?? false,
    }),
  };
}

function snapshotOf(
  entry: AirportCatalogEntry,
  charts: readonly ChartSummary[] = [],
): AirportSnapshot {
  return {
    airport: toAirport(entry, runways),
    procedures: charts.map((item) =>
      toProcedure(item, `SBGL/${item.id}.pdf`, new Date("2026-08-15T12:00:00Z")),
    ),
    runwaysCheckedAt: new Date("2026-10-01T00:00:00Z"),
    sourceUpdatedOn: entry.updatedOn,
  };
}

function plan(overrides: {
  entry?: AirportCatalogEntry;
  charts?: readonly ChartSummary[];
  snapshot?: AirportSnapshot | undefined;
  runwaysReason?: RunwaysReason | null;
  writeReasons?: readonly WriteReason[];
}): AirportPlan {
  return {
    entry: overrides.entry ?? sbgl,
    charts: overrides.charts ?? [],
    snapshot: "snapshot" in overrides ? overrides.snapshot : snapshotOf(sbgl),
    runwaysReason: overrides.runwaysReason ?? null,
    writeReasons: overrides.writeReasons ?? [],
  };
}

const signal = new AbortController().signal;

describe("ProcessAirport — pistas", () => {
  it("revalida as pistas e, sem mudança, só devolve a revalidação para marcar em lote", async () => {
    const { useCase, client, repository } = harness();

    const outcome = await useCase.execute(plan({ runwaysReason: "age" }), signal);

    expect(client.fetchedAirports).toEqual(["SBGL"]);
    expect(repository.calls).toEqual([]);
    expect(outcome.result).toBe("runways-confirmed");
    expect(outcome.runwaysCheck).toEqual({ icao: "SBGL", at: NOW, sourceUpdatedOn: "2026-09-10" });
  });

  it("grava com a revalidação quando as pistas mudaram", async () => {
    const changed = [{ ident: "10/28", lengthMeters: 4100, widthMeters: 45 }];
    const { useCase, repository } = harness({
      airports: { SBGL: airportDetails({ icao: "SBGL", runways: changed }) },
    });

    const outcome = await useCase.execute(plan({ runwaysReason: "source-updated" }), signal);

    expect(outcome.result).toBe("written");
    expect(repository.calls[0]?.airport.runways).toEqual(changed);
    expect(repository.calls[0]?.runwaysCheck).toEqual({ at: NOW, sourceUpdatedOn: "2026-09-10" });
  });

  it("grava aeródromo novo com o cadastro do catálogo e as pistas do detalhamento", async () => {
    const { useCase, repository } = harness({
      airports: {
        SBGL: airportDetails({ icao: "SBGL", name: "Nome do detalhamento", runways }),
      },
    });

    await useCase.execute(plan({ snapshot: undefined, runwaysReason: "new" }), signal);

    expect(repository.calls[0]?.airport).toEqual({
      icao: "SBGL",
      name: "Galeão",
      city: sbgl.city,
      state: sbgl.state,
      country: BRAZIL_COUNTRY_CODE,
      latitude: sbgl.latitude,
      longitude: sbgl.longitude,
      runways,
    });
  });

  it("não consulta o detalhamento quando só o cadastro mudou, e mantém as pistas persistidas", async () => {
    const { useCase, client, repository } = harness();

    const outcome = await useCase.execute(
      plan({ entry: { ...sbgl, city: "Rio" }, writeReasons: ["cadastro"] }),
      signal,
    );

    expect(client.fetchedAirports).toEqual([]);
    expect(outcome.result).toBe("written");
    expect(outcome.runwaysCheck).toBeNull();
    expect(repository.calls[0]?.airport.city).toBe("Rio");
    expect(repository.calls[0]?.airport.runways).toEqual(runways);
    expect(repository.calls[0]?.runwaysCheck).toBeUndefined();
  });

  it("propaga como falha definitiva o aeródromo sem detalhamento publicado", async () => {
    const { useCase, repository } = harness({
      airports: {
        SBGL: () => {
          throw new PermanentSourceError("a fonte não publica detalhamento");
        },
      },
    });

    await expect(
      useCase.execute(plan({ snapshot: undefined, runwaysReason: "new" }), signal),
    ).rejects.toBeInstanceOf(PermanentSourceError);
    expect(repository.calls).toEqual([]);
  });

  it("registra alerta de campos opcionais ausentes só quando grava", async () => {
    const bare = catalogEntry({
      icao: "SBGL",
      city: null,
      state: null,
      latitude: null,
      longitude: null,
    });
    const { useCase, report } = harness();

    await useCase.execute(plan({ entry: bare, writeReasons: ["cadastro"] }), signal);

    expect(report.warnings).toEqual(["SBGL: sem cidade, UF, coordenadas na fonte"]);
  });
});

describe("ProcessAirport — cartas e documentos", () => {
  const c1 = chart({ id: "c1" });

  it("grava as cartas do lote com a chave do documento arquivado", async () => {
    const { useCase, repository, storage } = harness();

    const outcome = await useCase.execute(plan({ charts: [c1], writeReasons: ["cartas"] }), signal);

    expect(storage.putKeys).toEqual(["SBGL/c1.pdf"]);
    expect(repository.calls[0]?.procedures).toEqual([toProcedure(c1, "SBGL/c1.pdf", NOW)]);
    expect(outcome.proceduresPersisted).toBe(1);
    expect(outcome.documentsArchived).toBe(1);
  });

  it("não baixa de novo documento já existente no bucket", async () => {
    const storage = new FakeChartStorage();
    storage.objects.set("SBGL/c1.pdf", pdfBytes());
    const { useCase, client } = harness({}, { storage });

    const outcome = await useCase.execute(plan({ charts: [c1], writeReasons: ["cartas"] }), signal);

    expect(client.downloadedCharts).toEqual([]);
    expect(outcome.documentsAlreadyPresent).toBe(1);
  });

  it("respeita --skip-documents: grava metadados sem baixar PDF", async () => {
    const { useCase, client, repository } = harness({}, { skipDocuments: true });

    await useCase.execute(plan({ charts: [c1], writeReasons: ["cartas"] }), signal);

    expect(client.downloadedCharts).toEqual([]);
    expect(repository.calls[0]?.procedures[0]?.storageKey).toBeNull();
  });

  it("arquiva no bucket ANTES do commit e remove os objetos DEPOIS", async () => {
    const order: string[] = [];
    const storage = new FakeChartStorage()
      .onPut((key) => order.push(`put ${key}`))
      .onDelete((key) => order.push(`delete ${key}`));
    const repository = new FakeAirportSyncRepository()
      .withRemovedIds(["antiga"])
      .onSync(() => order.push("commit"));
    const { useCase } = harness({}, { repository, storage });

    const outcome = await useCase.execute(plan({ charts: [c1], writeReasons: ["cartas"] }), signal);

    // A ordem inversa deixaria o banco apontando para documento inexistente.
    expect(order).toEqual(["put SBGL/c1.pdf", "commit", "delete SBGL/antiga.pdf"]);
    expect(outcome.documentsRemoved).toBe(1);
  });

  it("registra falha do documento e segue com as demais cartas do aeródromo", async () => {
    const { useCase, report, repository, storage } = harness({
      documents: { ruim: () => new TextEncoder().encode("<html>erro</html>") },
    });

    await useCase.execute(
      plan({ charts: [chart({ id: "ruim" }), chart({ id: "boa" })], writeReasons: ["cartas"] }),
      signal,
    );

    expect(storage.putKeys).toEqual(["SBGL/boa.pdf"]);
    expect(repository.calls[0]?.procedures).toHaveLength(2);
    expect(
      repository.calls[0]?.procedures.find((procedure) => procedure.id === "ruim")?.storageKey,
    ).toBeNull();
    expect(report.failures.map((failure) => failure.reason).join("\n")).toContain("ruim");
  });

  it("não interrompe o aeródromo quando a remoção de objeto órfão falha", async () => {
    const storage = new FakeChartStorage().onDelete(() => {
      throw new Error("bucket indisponível");
    });
    const repository = new FakeAirportSyncRepository().withRemovedIds(["antiga"]);
    const { useCase, report } = harness({}, { repository, storage });

    const outcome = await useCase.execute(plan({ charts: [c1], writeReasons: ["cartas"] }), signal);

    expect(outcome.result).toBe("written");
    expect(report.warnings.join("\n")).toMatch(/antiga/);
  });
});

describe("ProcessAirport — interrupção", () => {
  let controller: AbortController;

  beforeEach(() => {
    controller = new AbortController();
  });

  it("não inicia o processamento quando o sinal já foi abortado", async () => {
    controller.abort();
    const { useCase, client } = harness();

    await expect(
      useCase.execute(plan({ runwaysReason: "new" }), controller.signal),
    ).rejects.toBeDefined();
    expect(client.fetchedAirports).toEqual([]);
  });
});
