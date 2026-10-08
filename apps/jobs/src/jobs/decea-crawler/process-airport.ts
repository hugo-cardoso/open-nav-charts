import type { AisWebClient, ChartSummary } from "@open-nav-charts/aisweb-client";
import type {
  Airport,
  AirportRunway,
  AirportSyncRepository,
  RunwaysCheckOf,
} from "@open-nav-charts/domain";
import type { Clock } from "../../runtime/clock.js";
import type { AirportOutcome, RunReport } from "../../runtime/run-report.js";
import { sameRunways, toAirport, toProcedure } from "./airport-comparison.js";
import type { ChartArchiver } from "./chart-archiver.js";
import type { AirportPlan } from "./sync-planner.js";

export interface ProcessAirportOptions {
  readonly client: AisWebClient;
  readonly repository: AirportSyncRepository;
  readonly archiver: ChartArchiver;
  readonly report: RunReport;
  readonly clock: Clock;
  readonly skipDocuments: boolean;
}

/**
 * Unidade atômica de retry: executa o que o plano decidiu para um aeródromo —
 * revalidar as pistas, gravar, ou os dois (research R4). É reexecutável e
 * idempotente, então repetir não duplica — e a classe não sabe que está sendo
 * repetida.
 */
export class ProcessAirport {
  private readonly client: AisWebClient;
  private readonly repository: AirportSyncRepository;
  private readonly archiver: ChartArchiver;
  private readonly report: RunReport;
  private readonly clock: Clock;
  private readonly skipDocuments: boolean;

  constructor(options: ProcessAirportOptions) {
    this.client = options.client;
    this.repository = options.repository;
    this.archiver = options.archiver;
    this.report = options.report;
    this.clock = options.clock;
    this.skipDocuments = options.skipDocuments;
  }

  async execute(plan: AirportPlan, signal: AbortSignal): Promise<AirportOutcome> {
    signal.throwIfAborted();
    const { entry, snapshot } = plan;

    // O catálogo em lote já trouxe o cadastro; o detalhamento só é consultado
    // pelas pistas, e só quando o plano manda (research R3, R5).
    let runways: readonly AirportRunway[] = snapshot?.airport.runways ?? [];
    let runwaysCheck: RunwaysCheckOf | null = null;
    if (plan.runwaysReason !== null) {
      const details = await this.report.time("runways", this.clock, () =>
        this.client.fetchAirport(entry.icao),
      );
      runways = details.runways;
      runwaysCheck = { icao: entry.icao, at: this.clock.now(), sourceUpdatedOn: entry.updatedOn };

      const unchanged =
        snapshot !== undefined &&
        plan.writeReasons.length === 0 &&
        sameRunways(runways, snapshot.airport.runways);
      if (unchanged) {
        // Nada a gravar além da marcação, que a rotina faz em lote.
        return {
          ...emptyOutcome(entry.icao, entry.name),
          result: "runways-confirmed",
          runwaysCheck,
          runwaysReason: plan.runwaysReason,
        };
      }
    }

    // 1. Arquivar no bucket antes de tocar no banco.
    const archived = await this.report.time("documents", this.clock, () =>
      this.archiveDocuments(entry.icao, plan.charts, signal),
    );

    // 2. Uma transação: aeródromo, pistas, diff das cartas e a revalidação.
    const airport = this.toAirport(plan, runways);
    const now = this.clock.now();
    const procedures = plan.charts.map((chart) =>
      toProcedure(chart, archived.keys.get(chart.id) ?? null, now),
    );
    const { removedProcedureIds } = await this.report.time("database", this.clock, () =>
      this.repository.syncAirport({
        airport,
        procedures,
        ...(runwaysCheck === null
          ? {}
          : {
              runwaysCheck: { at: runwaysCheck.at, sourceUpdatedOn: runwaysCheck.sourceUpdatedOn },
            }),
      }),
    );

    // 3. Só depois do commit, remover os objetos das cartas que saíram de
    //    vigência. A ordem inversa deixaria o banco apontando para documento
    //    inexistente (data-model da 002, FR-020).
    const documentsRemoved = await this.report.time("documents", this.clock, () =>
      this.removeOrphanDocuments(entry.icao, removedProcedureIds),
    );

    return {
      icao: entry.icao,
      name: airport.name,
      result: "written",
      runwaysCheck,
      runwaysReason: plan.runwaysReason,
      proceduresPersisted: procedures.length,
      documentsArchived: archived.archivedCount,
      documentsAlreadyPresent: archived.alreadyPresentCount,
      documentsRemoved,
    };
  }

  private toAirport(plan: AirportPlan, runways: readonly AirportRunway[]): Airport {
    const { entry } = plan;
    const missing: string[] = [];
    if (entry.city === null) {
      missing.push("cidade");
    }
    if (entry.state === null) {
      missing.push("UF");
    }
    if (entry.latitude === null || entry.longitude === null) {
      missing.push("coordenadas");
    }
    if (missing.length > 0) {
      // Campo opcional ausente é registrado sem interromper a rotina (FR-009 da
      // 002). Só ao gravar: repetir o alerta para aeródromo inalterado a cada
      // execução seria ruído.
      this.report.recordWarning(`${entry.icao}: sem ${missing.join(", ")} na fonte`);
    }
    return toAirport(entry, runways);
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

function emptyOutcome(
  icao: string,
  name: string,
): Omit<AirportOutcome, "result" | "runwaysCheck" | "runwaysReason"> {
  return {
    icao,
    name,
    proceduresPersisted: 0,
    documentsArchived: 0,
    documentsAlreadyPresent: 0,
    documentsRemoved: 0,
  };
}
