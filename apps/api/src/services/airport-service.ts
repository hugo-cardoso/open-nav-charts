import type { Airport, AirportPage, AirportRepository } from "@open-nav-charts/domain";
import { normalizeSearchText } from "@open-nav-charts/domain";
import { AirportNotFoundError } from "../http/api-error.js";

export interface AirportListCriteria {
  readonly page: number;
  readonly pageSize: number;
  readonly state?: string | undefined;
  readonly country?: string | undefined;
  readonly search?: string | undefined;
}

export interface AirportServiceOptions {
  readonly repository: AirportRepository;
}

/**
 * Regra de consulta do catálogo. Recebe o repositório por construtor
 * (Princípio III) e não conhece HTTP — é o que permite exercitar a normalização
 * sem levantar servidor.
 */
export class AirportService {
  private readonly repository: AirportRepository;

  constructor(options: AirportServiceOptions) {
    this.repository = options.repository;
  }

  /**
   * O termo é normalizado aqui com a mesma função que gravou `search_text`: é
   * essa simetria que faz "galeao" encontrar "Galeão" (FR-006, research R5).
   */
  async list(criteria: AirportListCriteria): Promise<AirportPage> {
    return this.repository.list({
      page: criteria.page,
      pageSize: criteria.pageSize,
      state: criteria.state?.toUpperCase(),
      country: criteria.country?.toUpperCase(),
      search: criteria.search === undefined ? undefined : normalizeSearchText(criteria.search),
    });
  }

  /** ICAO em qualquer caixa resolve o mesmo recurso (FR-011). */
  async findByIcao(icao: string): Promise<Airport> {
    const normalized = icao.toUpperCase();
    const found = await this.repository.findByIcao(normalized);
    if (found === null) {
      throw new AirportNotFoundError(normalized);
    }
    return found;
  }
}
