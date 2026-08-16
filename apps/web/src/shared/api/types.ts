/**
 * Espelho dos modelos de resposta da API, copiados de
 * `apps/api/src/presentation/responses.ts`. A duplicação é deliberada e está
 * registrada em contracts/api-client.md: aqueles tipos vivem numa camada interna
 * da API, e importá-los cruzaria a fronteira de workspace por caminho interno,
 * o que o Princípio I proíbe.
 *
 * Campos ausentes chegam como `null` explícito, nunca omitidos — garantia da API
 * que permite distinguir "sem valor" de "campo removido".
 */

export interface AirportLocation {
  readonly city: string | null;
  readonly state: string | null;
  /** ISO 3166-1 alpha-2, sem tradução para nome por extenso. */
  readonly country: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface AirportSummary {
  readonly icao: string;
  readonly name: string;
  /** Sempre presente, ainda que todos os campos internos sejam nulos. */
  readonly location: AirportLocation;
}

export interface Runway {
  readonly ident: string;
  readonly lengthMeters: number | null;
  readonly widthMeters: number | null;
}

export interface AirportDetail extends AirportSummary {
  readonly runways: readonly Runway[];
}

export interface Procedure {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly amendment: string | null;
  /**
   * Calculado pela API a partir de `storageKey` e `archivedAt`. É a única
   * condição para oferecer a abertura da carta (FR-015).
   */
  readonly hasChart: boolean;
}

export interface PageResponse<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  /** Do conjunto filtrado, não do acervo inteiro. */
  readonly total: number;
  readonly hasNext: boolean;
}

export interface CollectionResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * `message` vem em português do Brasil e MUST NOT ser exibida na interface, que
 * é em inglês (FR-024). O texto mostrado deriva sempre de `code`.
 */
export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}
