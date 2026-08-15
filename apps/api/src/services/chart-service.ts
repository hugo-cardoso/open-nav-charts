import type { AirportProcedureRepository } from "@open-nav-charts/domain";
import type { ChartStorage } from "@open-nav-charts/object-storage";
import {
  ChartNotAvailableError,
  ChartStorageUnavailableError,
  ProcedureNotFoundError,
} from "../http/api-error.js";
import type { Logger } from "../observability/logger.js";
import { hasChart } from "../presentation/responses.js";

/** Validade da URL assinada, em segundos (FR-020). */
export const CHART_URL_TTL_SECONDS = 300;

export interface ChartRequest {
  readonly icao: string;
  readonly procedureId: string;
}

export interface ChartServiceOptions {
  readonly procedures: AirportProcedureRepository;
  readonly storage: ChartStorage;
  readonly logger: Logger;
}

export class ChartService {
  private readonly procedures: AirportProcedureRepository;
  private readonly storage: ChartStorage;
  private readonly logger: Logger;

  constructor(options: ChartServiceOptions) {
    this.procedures = options.procedures;
    this.storage = options.storage;
    this.logger = options.logger;
  }

  /**
   * Ordem de verificação de data-model §7. A ordem é o que produz as distinções
   * de erro exigidas por FR-021 e FR-022 — trocá-la vazaria a existência de um
   * procedimento sob outro aeródromo.
   */
  async resolveChartUrl(request: ChartRequest): Promise<string> {
    const icao = request.icao.toUpperCase();

    const procedure = await this.procedures.findById(request.procedureId);
    if (procedure === null) {
      throw new ProcedureNotFoundError();
    }

    // Mesma resposta do caso inexistente: nunca revelar que o procedimento
    // existe sob outro ICAO (FR-021).
    if (procedure.airportIcao.toUpperCase() !== icao) {
      throw new ProcedureNotFoundError();
    }

    if (!hasChart(procedure) || procedure.storageKey === null) {
      throw new ChartNotAvailableError();
    }

    try {
      return await this.storage.presignGetUrl(procedure.storageKey, CHART_URL_TTL_SECONDS);
    } catch (error) {
      // A causa real fica no log do servidor; o consumidor recebe só o código
      // (FR-023, FR-035).
      this.logger.error("falha ao assinar a URL do documento", {
        icao,
        procedureId: procedure.id,
        reason: error instanceof Error ? error.message : String(error),
      });
      throw new ChartStorageUnavailableError();
    }
  }
}
