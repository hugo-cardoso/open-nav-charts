import type {
  AirportProcedure,
  AirportProcedureRepository,
  AirportRepository,
} from "@open-nav-charts/domain";
import { AirportNotFoundError } from "../http/api-error.js";

export interface ProcedureListCriteria {
  readonly icao: string;
  readonly type?: string | undefined;
}

export interface ProcedureServiceOptions {
  readonly airports: AirportRepository;
  readonly procedures: AirportProcedureRepository;
}

export class ProcedureService {
  private readonly airports: AirportRepository;
  private readonly procedures: AirportProcedureRepository;

  constructor(options: ProcedureServiceOptions) {
    this.airports = options.airports;
    this.procedures = options.procedures;
  }

  /**
   * Confirma o aeródromo antes de listar: é o que distingue "aeródromo
   * inexistente" (404) de "aeródromo sem procedimentos" (200 com lista vazia),
   * que FR-016 exige separar.
   */
  async listByAirport(criteria: ProcedureListCriteria): Promise<readonly AirportProcedure[]> {
    const icao = criteria.icao.toUpperCase();
    if ((await this.airports.findByIcao(icao)) === null) {
      throw new AirportNotFoundError(icao);
    }

    const procedures = await this.procedures.listByAirport(icao);
    if (criteria.type === undefined) {
      return procedures;
    }

    const type = criteria.type.toUpperCase();
    return procedures.filter((procedure) => procedure.type.toUpperCase() === type);
  }
}
