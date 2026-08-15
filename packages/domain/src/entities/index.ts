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
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly runways: readonly AirportRunway[];
}

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
