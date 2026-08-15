import type {
  Airport,
  AirportListQuery,
  AirportPage,
  AirportProcedure,
  AirportProcedureRepository,
  AirportRepository,
  AirportSummary,
} from "@open-nav-charts/domain";
import { normalizeSearchText } from "@open-nav-charts/domain";
import type { ChartStorage } from "@open-nav-charts/object-storage";

/**
 * Dublês em memória usados pelos testes unitários e de contrato. Implementam as
 * mesmas interfaces que a produção — nenhum monkey-patching de módulo
 * (Princípio III) — e reproduzem as regras que o teste depende: ordenação por
 * ICAO, filtro, busca normalizada e paginação.
 */

export class FakeAirportRepository implements AirportRepository {
  readonly listCalls: AirportListQuery[] = [];
  private readonly airports = new Map<string, Airport>();
  private failure: Error | null = null;

  constructor(airports: readonly Airport[] = []) {
    for (const entity of airports) {
      this.airports.set(entity.icao, entity);
    }
  }

  /** Faz toda leitura falhar, para exercitar o caminho de erro não previsto. */
  failWith(error: Error): this {
    this.failure = error;
    return this;
  }

  async findByIcao(icao: string): Promise<Airport | null> {
    this.throwIfFailing();
    return this.airports.get(icao) ?? null;
  }

  async listByState(state: string): Promise<readonly Airport[]> {
    this.throwIfFailing();
    return [...this.airports.values()].filter((entity) => entity.state === state);
  }

  async list(query: AirportListQuery): Promise<AirportPage> {
    this.throwIfFailing();
    this.listCalls.push(query);

    const matching = [...this.airports.values()]
      .filter((entity) => query.state === undefined || entity.state === query.state)
      // Aeródromo sem país nunca entra no resultado de um filtro de país
      // (FR-022): a comparação por igualdade já exclui `null`.
      .filter((entity) => query.country === undefined || entity.country === query.country)
      .filter((entity) => {
        if (query.search === undefined) {
          return true;
        }
        const searchText = normalizeSearchText(
          `${entity.icao} ${entity.name} ${entity.city ?? ""}`,
        );
        return searchText.includes(query.search);
      })
      .sort((left, right) => left.icao.localeCompare(right.icao));

    const offset = (query.page - 1) * query.pageSize;
    const items = matching
      .slice(offset, offset + query.pageSize)
      .map(({ runways: _runways, ...summary }): AirportSummary => summary);

    return { items, total: matching.length };
  }

  async save(entity: Airport): Promise<void> {
    this.airports.set(entity.icao, entity);
  }

  private throwIfFailing(): void {
    if (this.failure !== null) {
      throw this.failure;
    }
  }
}

export class FakeAirportProcedureRepository implements AirportProcedureRepository {
  private readonly procedures = new Map<string, AirportProcedure>();

  constructor(procedures: readonly AirportProcedure[] = []) {
    for (const procedure of procedures) {
      this.procedures.set(procedure.id, procedure);
    }
  }

  async listByAirport(icao: string): Promise<readonly AirportProcedure[]> {
    return [...this.procedures.values()].filter((procedure) => procedure.airportIcao === icao);
  }

  async findById(id: string): Promise<AirportProcedure | null> {
    return this.procedures.get(id) ?? null;
  }

  async saveAll(procedures: readonly AirportProcedure[]): Promise<void> {
    for (const procedure of procedures) {
      this.procedures.set(procedure.id, procedure);
    }
  }

  async deleteByIds(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      this.procedures.delete(id);
    }
  }
}

export class FakeChartStorage implements ChartStorage {
  readonly objects = new Map<string, Uint8Array>();
  readonly presignedKeys: string[] = [];
  private presignFailure: Error | null = null;

  /** Faz a assinatura falhar, para exercitar o `502 CHART_STORAGE_UNAVAILABLE`. */
  failPresignWith(error: Error): this {
    this.presignFailure = error;
    return this;
  }

  buildKey(icao: string, procedureId: string): string {
    return `${icao.toUpperCase()}/${procedureId}.pdf`;
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async put(key: string, content: Uint8Array): Promise<void> {
    this.objects.set(key, content);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async presignGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (this.presignFailure !== null) {
      throw this.presignFailure;
    }
    this.presignedKeys.push(key);
    // Reproduz a forma da URL real o bastante para o teste de contrato asseverar
    // o `Location` sem depender do SDK.
    return `http://bucket.example/onc-charts/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresInSeconds}&X-Amz-Signature=abc123`;
  }
}

/** Verificação de saúde controlável pelo teste. */
export class FakeHealthProbe {
  private failure: Error | null = null;

  failWith(error: Error): this {
    this.failure = error;
    return this;
  }

  recover(): this {
    this.failure = null;
    return this;
  }

  ping = async (): Promise<void> => {
    if (this.failure !== null) {
      throw this.failure;
    }
  };
}

export function airport(overrides: Partial<Airport> & Pick<Airport, "icao">): Airport {
  return {
    name: `Aeródromo ${overrides.icao}`,
    city: "Cidade",
    state: "RJ",
    country: "BR",
    latitude: -22.809999,
    longitude: -43.250556,
    runways: [],
    ...overrides,
  };
}

export function procedure(
  overrides: Partial<AirportProcedure> & Pick<AirportProcedure, "id">,
): AirportProcedure {
  return {
    airportIcao: "SBGL",
    name: `Carta ${overrides.id}`,
    type: "IAC",
    amendment: null,
    sourceUrl: null,
    storageKey: null,
    archivedAt: null,
    ...overrides,
  };
}

/** Procedimento com documento arquivado — `hasChart` verdadeiro. */
export function archivedProcedure(
  overrides: Partial<AirportProcedure> & Pick<AirportProcedure, "id">,
): AirportProcedure {
  const icao = overrides.airportIcao ?? "SBGL";
  return procedure({
    storageKey: `${icao}/${overrides.id}.pdf`,
    archivedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}
