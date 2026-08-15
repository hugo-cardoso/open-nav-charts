import { PermanentSourceError } from "@open-nav-charts/aisweb-client";
import { beforeEach, describe, expect, it } from "vitest";
import { RunReport } from "../../runtime/run-report.js";
import {
  airportDetails,
  chart,
  FakeAirportSyncRepository,
  FakeAisWebClient,
  type FakeAisWebOptions,
  FakeChartStorage,
  pdfBytes,
} from "../../testing/doubles.js";
import { ChartArchiver } from "./chart-archiver.js";
import { ChartTypeAudit } from "./chart-type-audit.js";
import { ProcessAirport } from "./process-airport.js";

interface Harness {
  readonly client: FakeAisWebClient;
  readonly repository: FakeAirportSyncRepository;
  readonly storage: FakeChartStorage;
  readonly report: RunReport;
  readonly audit: ChartTypeAudit;
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
  const client = new FakeAisWebClient(options);
  const repository = overrides.repository ?? new FakeAirportSyncRepository();
  const storage = overrides.storage ?? new FakeChartStorage();
  const report = new RunReport(new Date("2026-08-15T10:00:00Z"));
  const audit = new ChartTypeAudit();
  const archiver = new ChartArchiver({ client, storage });

  return {
    client,
    repository,
    storage,
    report,
    audit,
    useCase: new ProcessAirport({
      client,
      repository,
      archiver,
      audit,
      report,
      skipDocuments: overrides.skipDocuments ?? false,
    }),
  };
}

describe("ProcessAirport — aeródromo (US1)", () => {
  it("busca o detalhamento e grava aeródromo com pistas", async () => {
    const { useCase, client, repository } = harness({
      airports: {
        SBGL: airportDetails({
          icao: "SBGL",
          name: "Galeão - Antônio Carlos Jobim",
          city: "Rio de Janeiro",
          state: "RJ",
          runways: [
            { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
            { ident: "15/33", lengthMeters: 3180, widthMeters: 47 },
          ],
        }),
      },
    });

    const outcome = await useCase.execute("SBGL", new AbortController().signal);

    expect(client.fetchedAirports).toEqual(["SBGL"]);
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.airport).toEqual({
      icao: "SBGL",
      name: "Galeão - Antônio Carlos Jobim",
      city: "Rio de Janeiro",
      state: "RJ",
      latitude: -22.81,
      longitude: -43.250556,
      runways: [
        { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
        { ident: "15/33", lengthMeters: 3180, widthMeters: 47 },
      ],
    });
    expect(outcome.icao).toBe("SBGL");
  });

  it("persiste aeródromo sem cidade, UF e coordenadas, registrando alerta", async () => {
    const { useCase, repository, report } = harness({
      airports: {
        SWXX: airportDetails({
          icao: "SWXX",
          name: "Fazenda Sem Cadastro",
          city: null,
          state: null,
          latitude: null,
          longitude: null,
        }),
      },
    });

    await useCase.execute("SWXX", new AbortController().signal);

    expect(repository.calls[0]?.airport.city).toBeNull();
    expect(repository.calls[0]?.airport.state).toBeNull();
    expect(repository.calls[0]?.airport.latitude).toBeNull();
    expect(report.warnings.join("\n")).toContain("SWXX");
    expect(report.warnings.join("\n")).toMatch(/cidade|city/i);
  });

  it("aceita aeródromo sem nenhuma pista", async () => {
    const { useCase, repository } = harness({
      airports: { SWXX: airportDetails({ icao: "SWXX", runways: [] }) },
    });

    await useCase.execute("SWXX", new AbortController().signal);

    expect(repository.calls[0]?.airport.runways).toEqual([]);
  });

  it("propaga como falha o aeródromo sem nome", async () => {
    const { useCase, repository } = harness({
      airports: {
        SBXX: () => {
          throw new PermanentSourceError("aeródromo SBXX sem name na resposta da fonte");
        },
      },
    });

    await expect(useCase.execute("SBXX", new AbortController().signal)).rejects.toBeInstanceOf(
      PermanentSourceError,
    );
    expect(repository.calls).toHaveLength(0);
  });

  it("grava meia coordenada como nenhuma", async () => {
    const { useCase, repository, report } = harness({
      airports: {
        SWXX: airportDetails({ icao: "SWXX", latitude: -22.81, longitude: null }),
      },
    });

    await useCase.execute("SWXX", new AbortController().signal);

    expect(repository.calls[0]?.airport.latitude).toBeNull();
    expect(repository.calls[0]?.airport.longitude).toBeNull();
    expect(report.warnings.join("\n")).toMatch(/coordenada/i);
  });
});

describe("ProcessAirport — cartas (US2)", () => {
  it("busca as cartas IFR e as grava na mesma transação do aeródromo", async () => {
    const { useCase, client, repository } = harness({
      charts: {
        SBGL: [chart({ id: "c1", type: "IAC" }), chart({ id: "c2", type: "SID" })],
      },
    });

    const outcome = await useCase.execute("SBGL", new AbortController().signal);

    expect(client.fetchedCharts).toEqual(["SBGL"]);
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.procedures.map((procedure) => procedure.id)).toEqual(["c1", "c2"]);
    expect(outcome.proceduresPersisted).toBe(2);
  });

  it("mapeia os campos da carta para o procedimento persistido", async () => {
    const { useCase, repository } = harness({
      charts: {
        SBGL: [
          chart({
            id: "c1",
            name: "RNP Y RWY 28",
            type: "IAC",
            amendment: "2601A1",
            link: "https://aisweb.example/download/?arquivo=c1",
          }),
        ],
      },
    });

    await useCase.execute("SBGL", new AbortController().signal);

    const procedure = repository.calls[0]?.procedures[0];
    expect(procedure).toMatchObject({
      id: "c1",
      airportIcao: "SBGL",
      name: "RNP Y RWY 28",
      type: "IAC",
      amendment: "2601A1",
      sourceUrl: "https://aisweb.example/download/?arquivo=c1",
    });
  });

  it("mantém o aeródromo persistido quando ele não tem cartas", async () => {
    const { useCase, repository } = harness({ charts: { SWXX: [] } });

    const outcome = await useCase.execute("SWXX", new AbortController().signal);

    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.procedures).toEqual([]);
    expect(outcome.proceduresPersisted).toBe(0);
  });

  it("faz o aeródromo falhar quando a carta vem sem campo obrigatório", async () => {
    const { useCase, repository } = harness({
      charts: {
        SBGL: () => {
          throw new PermanentSourceError("carta de SBGL sem id, nome ou tipo");
        },
      },
    });

    await expect(useCase.execute("SBGL", new AbortController().signal)).rejects.toBeInstanceOf(
      PermanentSourceError,
    );
    expect(repository.calls).toHaveLength(0);
  });

  it("alimenta a auditoria de tipos sem descartar carta desconhecida", async () => {
    const { useCase, repository, report, audit } = harness({
      charts: { SBGL: [chart({ id: "c1", type: "XYZ" })] },
    });

    await useCase.execute("SBGL", new AbortController().signal);

    expect(repository.calls[0]?.procedures).toHaveLength(1);
    expect(audit.unknownTypes).toContain("XYZ");
    expect(report.warnings.join("\n")).toContain("XYZ");
  });

  it("conta como removidas as cartas que saíram de vigência", async () => {
    const repository = new FakeAirportSyncRepository().withRemovedIds(["antiga1", "antiga2"]);
    const { useCase } = harness({ charts: { SBGL: [chart({ id: "c1" })] } }, { repository });

    const outcome = await useCase.execute("SBGL", new AbortController().signal);

    expect(outcome.documentsRemoved).toBe(2);
  });
});

describe("ProcessAirport — documentos (US3)", () => {
  it("arquiva o documento e grava a chave no procedimento", async () => {
    const { useCase, repository, storage } = harness({
      charts: { SBGL: [chart({ id: "c1" })] },
    });

    const outcome = await useCase.execute("SBGL", new AbortController().signal);

    expect(storage.putKeys).toEqual(["SBGL/c1.pdf"]);
    expect(repository.calls[0]?.procedures[0]?.storageKey).toBe("SBGL/c1.pdf");
    expect(repository.calls[0]?.procedures[0]?.archivedAt).toBeInstanceOf(Date);
    expect(outcome.documentsArchived).toBe(1);
  });

  it("respeita --skip-documents: coleta metadados sem baixar PDF", async () => {
    const { useCase, client, storage, repository } = harness(
      { charts: { SBGL: [chart({ id: "c1" })] } },
      { skipDocuments: true },
    );

    const outcome = await useCase.execute("SBGL", new AbortController().signal);

    expect(client.downloadedCharts).toEqual([]);
    expect(storage.putKeys).toEqual([]);
    expect(repository.calls[0]?.procedures[0]?.storageKey).toBeNull();
    expect(outcome.documentsArchived).toBe(0);
  });

  it("arquiva no bucket ANTES do commit e remove os objetos DEPOIS", async () => {
    const order: string[] = [];
    const storage = new FakeChartStorage()
      .onPut((key) => order.push(`put ${key}`))
      .onDelete((key) => order.push(`delete ${key}`));
    const repository = new FakeAirportSyncRepository()
      .withRemovedIds(["antiga"])
      .onSync(() => order.push("commit"));
    const { useCase } = harness(
      { charts: { SBGL: [chart({ id: "c1" })] } },
      { repository, storage },
    );

    await useCase.execute("SBGL", new AbortController().signal);

    // A ordem inversa produziria o único estado ruim: registro no banco
    // apontando para documento inexistente (data-model, FR-020).
    expect(order).toEqual(["put SBGL/c1.pdf", "commit", "delete SBGL/antiga.pdf"]);
  });

  it("não baixa de novo documento já existente no bucket", async () => {
    const storage = new FakeChartStorage();
    storage.objects.set("SBGL/c1.pdf", pdfBytes());
    const { useCase, client } = harness({ charts: { SBGL: [chart({ id: "c1" })] } }, { storage });

    const outcome = await useCase.execute("SBGL", new AbortController().signal);

    expect(client.downloadedCharts).toEqual([]);
    expect(storage.putKeys).toEqual([]);
    expect(outcome.documentsAlreadyPresent).toBe(1);
  });

  it("registra falha do documento e segue com as demais cartas do aeródromo", async () => {
    const { useCase, report, repository, storage } = harness({
      charts: { SBGL: [chart({ id: "ruim" }), chart({ id: "boa" })] },
      documents: { ruim: () => new TextEncoder().encode("<html>erro</html>") },
    });

    const outcome = await useCase.execute("SBGL", new AbortController().signal);

    expect(storage.putKeys).toEqual(["SBGL/boa.pdf"]);
    expect(outcome.documentsArchived).toBe(1);
    // A carta com documento falho continua persistida, sem storage_key.
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
    const { useCase, report } = harness(
      { charts: { SBGL: [chart({ id: "c1" })] } },
      { repository, storage },
    );

    // Objeto órfão é inofensivo e é limpo na execução seguinte (data-model).
    const outcome = await useCase.execute("SBGL", new AbortController().signal);

    expect(outcome.documentsArchived).toBe(1);
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

    await expect(useCase.execute("SBGL", controller.signal)).rejects.toBeDefined();
    expect(client.fetchedAirports).toEqual([]);
  });
});
