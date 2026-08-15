import type { AirportProcedure } from "@open-nav-charts/domain";
import { describe, expect, it } from "vitest";
import {
  ChartNotAvailableError,
  ChartStorageUnavailableError,
  ProcedureNotFoundError,
} from "../http/api-error.js";
import { RecordingLogger } from "../observability/logger.js";
import {
  archivedProcedure,
  FakeAirportProcedureRepository,
  FakeChartStorage,
  procedure,
} from "../testing/doubles.js";
import { CHART_URL_TTL_SECONDS, ChartService } from "./chart-service.js";

function build(options: {
  procedures?: readonly AirportProcedure[];
  storage?: FakeChartStorage;
  logger?: RecordingLogger;
}) {
  const storage = options.storage ?? new FakeChartStorage();
  const logger = options.logger ?? new RecordingLogger();
  const service = new ChartService({
    procedures: new FakeAirportProcedureRepository(options.procedures ?? []),
    storage,
    logger,
  });
  return { service, storage, logger };
}

describe("ChartService.resolveChartUrl", () => {
  it("assina a URL do documento com validade de 5 minutos (FR-020)", async () => {
    const { service, storage } = build({
      procedures: [archivedProcedure({ id: "p1", airportIcao: "SBGL" })],
    });

    const url = await service.resolveChartUrl({ icao: "SBGL", procedureId: "p1" });

    expect(storage.presignedKeys).toEqual(["SBGL/p1.pdf"]);
    expect(url).toContain(`X-Amz-Expires=${CHART_URL_TTL_SECONDS}`);
    expect(CHART_URL_TTL_SECONDS).toBe(300);
  });

  it("normaliza o ICAO do caminho para maiúsculas", async () => {
    const { service } = build({
      procedures: [archivedProcedure({ id: "p1", airportIcao: "SBGL" })],
    });

    await expect(service.resolveChartUrl({ icao: "sbgl", procedureId: "p1" })).resolves.toContain(
      "SBGL/p1.pdf",
    );
  });

  it("responde PROCEDURE_NOT_FOUND para procedimento inexistente", async () => {
    const { service } = build({});

    await expect(
      service.resolveChartUrl({ icao: "SBGL", procedureId: "nao-existe" }),
    ).rejects.toThrow(ProcedureNotFoundError);
  });

  it("responde PROCEDURE_NOT_FOUND — e não CHART_NOT_AVAILABLE — para procedimento de outro aeródromo (FR-021)", async () => {
    // A ordem de verificação importa: o pertencimento é checado antes da
    // disponibilidade, senão a resposta revelaria que o procedimento existe sob
    // outro ICAO.
    const { service, storage } = build({
      procedures: [archivedProcedure({ id: "p1", airportIcao: "SBGL" })],
    });

    const rejected = service.resolveChartUrl({ icao: "SBSP", procedureId: "p1" });

    await expect(rejected).rejects.toThrow(ProcedureNotFoundError);
    await expect(rejected).rejects.not.toThrow(ChartNotAvailableError);
    expect(storage.presignedKeys).toEqual([]);
  });

  it("não vaza o ICAO real do procedimento na mensagem", async () => {
    const { service } = build({
      procedures: [archivedProcedure({ id: "p1", airportIcao: "SBGL" })],
    });

    await expect(service.resolveChartUrl({ icao: "SBSP", procedureId: "p1" })).rejects.toThrow(
      /^(?!.*SBGL).*$/,
    );
  });

  it("responde CHART_NOT_AVAILABLE quando o documento não foi arquivado (FR-022)", async () => {
    const { service } = build({
      procedures: [procedure({ id: "p1", airportIcao: "SBGL" })],
    });

    await expect(service.resolveChartUrl({ icao: "SBGL", procedureId: "p1" })).rejects.toThrow(
      ChartNotAvailableError,
    );
  });

  it("responde CHART_NOT_AVAILABLE quando só uma das duas marcas está presente", async () => {
    const semArchivedAt = build({
      procedures: [procedure({ id: "p1", storageKey: "SBGL/p1.pdf", archivedAt: null })],
    });
    const semStorageKey = build({
      procedures: [procedure({ id: "p1", storageKey: null, archivedAt: new Date() })],
    });

    await expect(
      semArchivedAt.service.resolveChartUrl({ icao: "SBGL", procedureId: "p1" }),
    ).rejects.toThrow(ChartNotAvailableError);
    await expect(
      semStorageKey.service.resolveChartUrl({ icao: "SBGL", procedureId: "p1" }),
    ).rejects.toThrow(ChartNotAvailableError);
  });

  it("converte falha de assinatura em CHART_STORAGE_UNAVAILABLE e registra no log (FR-023)", async () => {
    const storage = new FakeChartStorage().failPresignWith(new Error("credencial expirada"));
    const logger = new RecordingLogger();
    const { service } = build({
      procedures: [archivedProcedure({ id: "p1", airportIcao: "SBGL" })],
      storage,
      logger,
    });

    await expect(service.resolveChartUrl({ icao: "SBGL", procedureId: "p1" })).rejects.toThrow(
      ChartStorageUnavailableError,
    );

    const registered = logger.entries.find((entry) => entry.level === "error");
    expect(registered?.fields).toMatchObject({
      icao: "SBGL",
      procedureId: "p1",
      reason: "credencial expirada",
    });
  });

  it("não expõe a causa da falha de assinatura ao consumidor (FR-035)", async () => {
    const { service } = build({
      procedures: [archivedProcedure({ id: "p1", airportIcao: "SBGL" })],
      storage: new FakeChartStorage().failPresignWith(new Error("segredo interno do bucket")),
    });

    await expect(service.resolveChartUrl({ icao: "SBGL", procedureId: "p1" })).rejects.toThrow(
      /^(?!.*segredo interno).*$/,
    );
  });
});
