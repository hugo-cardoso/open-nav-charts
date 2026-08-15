import {
  type AirportDetails,
  type AisWebClient,
  BRAZIL_COUNTRY_CODE,
  type ChartSummary,
} from "@open-nav-charts/aisweb-client";
import type { Airport, AirportProcedure, AirportSyncRepository } from "@open-nav-charts/domain";
import type { AirportOutcome, RunReport } from "../../runtime/run-report.js";
import type { ChartArchiver } from "./chart-archiver.js";
import type { ChartTypeAudit } from "./chart-type-audit.js";

export interface ProcessAirportOptions {
  readonly client: AisWebClient;
  readonly repository: AirportSyncRepository;
  readonly archiver: ChartArchiver;
  readonly audit: ChartTypeAudit;
  readonly report: RunReport;
  readonly skipDocuments: boolean;
}

/**
 * Unidade atômica de retry: detalhamento, cartas e documentos de um ICAO
 * (research R7). É reexecutável e idempotente, então repetir não duplica —
 * e a classe não sabe que está sendo repetida.
 */
export class ProcessAirport {
  private readonly client: AisWebClient;
  private readonly repository: AirportSyncRepository;
  private readonly archiver: ChartArchiver;
  private readonly audit: ChartTypeAudit;
  private readonly report: RunReport;
  private readonly skipDocuments: boolean;

  constructor(options: ProcessAirportOptions) {
    this.client = options.client;
    this.repository = options.repository;
    this.archiver = options.archiver;
    this.audit = options.audit;
    this.report = options.report;
    this.skipDocuments = options.skipDocuments;
  }

  async execute(icao: string, signal: AbortSignal): Promise<AirportOutcome> {
    signal.throwIfAborted();

    const details = await this.client.fetchAirport(icao);
    const charts = await this.client.fetchIfrCharts(icao);
    this.auditChartTypes(icao, charts);

    // 1. Arquivar no bucket antes de tocar no banco.
    const archived = await this.archiveDocuments(icao, charts, signal);

    // 2. Uma transação: aeródromo, pistas e diff das cartas.
    const airport = this.toAirport(icao, details);
    const procedures = charts.map((chart) => this.toProcedure(chart, archived.keys.get(chart.id)));
    const { removedProcedureIds } = await this.repository.syncAirport({ airport, procedures });

    // 3. Só depois do commit, remover os objetos das cartas que saíram de
    //    vigência. A ordem inversa deixaria o banco apontando para documento
    //    inexistente (data-model, FR-020).
    const documentsRemoved = await this.removeOrphanDocuments(icao, removedProcedureIds);

    return {
      icao,
      name: airport.name,
      proceduresPersisted: procedures.length,
      documentsArchived: archived.archivedCount,
      documentsAlreadyPresent: archived.alreadyPresentCount,
      documentsRemoved,
    };
  }

  private toAirport(icao: string, details: AirportDetails): Airport {
    // Meia coordenada é inútil: as duas são gravadas juntas ou nenhuma.
    const hasCoordinates = details.latitude !== null && details.longitude !== null;
    if (!hasCoordinates && (details.latitude !== null || details.longitude !== null)) {
      this.report.recordWarning(`${icao}: coordenada incompleta na fonte, gravada como ausente`);
    }

    const missing: string[] = [];
    if (details.city === null) {
      missing.push("cidade");
    }
    if (details.state === null) {
      missing.push("UF");
    }
    if (!hasCoordinates) {
      missing.push("coordenadas");
    }
    if (missing.length > 0) {
      // Campo opcional ausente é registrado sem interromper a rotina (FR-009).
      this.report.recordWarning(`${icao}: sem ${missing.join(", ")} na fonte`);
    }

    return {
      icao: details.icao.toUpperCase(),
      name: details.name,
      city: details.city,
      state: details.state,
      // Fora de qualquer condicional: a fonte cobre só o Brasil, então o país é
      // conhecido mesmo quando cidade, UF e coordenadas faltam (FR-005).
      country: BRAZIL_COUNTRY_CODE,
      latitude: hasCoordinates ? details.latitude : null,
      longitude: hasCoordinates ? details.longitude : null,
      runways: details.runways.map((runway) => ({
        ident: runway.ident,
        lengthMeters: runway.lengthMeters,
        widthMeters: runway.widthMeters,
      })),
    };
  }

  private toProcedure(chart: ChartSummary, archivedKey: string | undefined): AirportProcedure {
    return {
      id: chart.id,
      airportIcao: chart.airportIcao.toUpperCase(),
      name: chart.name,
      type: chart.type,
      amendment: chart.amendment,
      sourceUrl: chart.link,
      storageKey: archivedKey ?? null,
      archivedAt: archivedKey === undefined ? null : new Date(),
    };
  }

  private auditChartTypes(icao: string, charts: readonly ChartSummary[]): void {
    for (const chart of charts) {
      const wasUnknown = this.audit.isUnknown(chart.type);
      this.audit.record(chart.type);
      if (wasUnknown) {
        // A carta é persistida normalmente: a fonte é a autoridade e descartar
        // um tipo novo seria perda de dado por omissão (FR-012, research R2).
        this.report.recordWarning(
          `${icao}: tipo de carta desconhecido "${chart.type}" na espécie IFR (carta ${chart.id})`,
        );
      }
    }
  }

  private async archiveDocuments(
    icao: string,
    charts: readonly ChartSummary[],
    signal: AbortSignal,
  ): Promise<{
    readonly keys: ReadonlyMap<string, string>;
    readonly archivedCount: number;
    readonly alreadyPresentCount: number;
  }> {
    const keys = new Map<string, string>();
    if (this.skipDocuments) {
      return { keys, archivedCount: 0, alreadyPresentCount: 0 };
    }

    let archivedCount = 0;
    let alreadyPresentCount = 0;

    for (const chart of charts) {
      const outcome = await this.archiver.archive(chart, signal);
      if (outcome.status === "failed") {
        this.report.recordFailure(icao, outcome.reason);
        continue;
      }
      keys.set(chart.id, outcome.key);
      if (outcome.status === "archived") {
        archivedCount += 1;
      } else {
        alreadyPresentCount += 1;
      }
    }

    return { keys, archivedCount, alreadyPresentCount };
  }

  private async removeOrphanDocuments(icao: string, ids: readonly string[]): Promise<number> {
    if (this.skipDocuments || ids.length === 0) {
      return 0;
    }

    let removed = 0;
    for (const id of ids) {
      try {
        await this.archiver.remove(icao, id);
        removed += 1;
      } catch (error) {
        // Objeto órfão é inofensivo e é limpo na execução seguinte — não vale
        // derrubar o aeródromo já commitado (data-model).
        this.report.recordWarning(
          `${icao}: falha ao remover o documento da carta ${id} do bucket: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return removed;
  }
}
