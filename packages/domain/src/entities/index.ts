/**
 * Entidades do domínio. Tipos puros, sem dependência de ORM — é o que a futura
 * API REST serializa (FR-031).
 */

export interface AirportRunway {
  readonly ident: string;
  readonly lengthMeters: number | null;
  readonly widthMeters: number | null;
}

export interface Airport {
  readonly icao: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
  /** Código ISO 3166-1 alpha-2, em caixa alta. `null` em registro de procedência
   * não registrada. */
  readonly country: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly runways: readonly AirportRunway[];
}

/**
 * Aeródromo sem as pistas. Torna explícito em tempo de compilação que a listagem
 * paginada não as carrega, em vez de devolver `Airport` com um array vazio
 * ambíguo.
 */
export type AirportSummary = Omit<Airport, "runways">;

export interface AirportProcedure {
  readonly id: string;
  readonly airportIcao: string;
  readonly name: string;
  readonly type: string;
  readonly amendment: string | null;
  readonly sourceUrl: string | null;
  readonly storageKey: string | null;
  readonly archivedAt: Date | null;
}
