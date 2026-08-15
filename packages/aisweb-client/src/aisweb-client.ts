/**
 * País de todo aeródromo publicado por esta fonte, em ISO 3166-1 alpha-2. O valor
 * é uma propriedade da fonte, não do domínio: é `BR` porque o DECEA cobre
 * exclusivamente o Brasil, e outra fonte traria outro código. A fonte não informa
 * o país em nenhum campo, então ele é atribuído aqui (research R3).
 */
export const BRAZIL_COUNTRY_CODE = "BR";

export interface RunwayDetails {
  readonly ident: string;
  readonly lengthMeters: number | null;
  readonly widthMeters: number | null;
}

/** Detalhamento de um aeródromo, como a fonte o publica. */
export interface AirportDetails {
  readonly icao: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly runways: readonly RunwayDetails[];
}

/** Carta de navegação listada pela fonte, antes de virar procedimento persistido. */
export interface ChartSummary {
  readonly id: string;
  readonly airportIcao: string;
  readonly name: string;
  readonly type: string;
  readonly amendment: string | null;
  readonly link: string | null;
}

export interface AisWebClient {
  countAirports(): Promise<number>;
  listAirportIcaos(offset: number, limit: number): Promise<readonly string[]>;
  fetchAirport(icao: string): Promise<AirportDetails>;
  fetchIfrCharts(icao: string): Promise<readonly ChartSummary[]>;
  downloadChart(chart: ChartSummary): Promise<Uint8Array>;
}
