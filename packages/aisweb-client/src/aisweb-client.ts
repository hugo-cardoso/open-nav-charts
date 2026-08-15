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
