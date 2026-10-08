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

/**
 * Um aeródromo do catálogo em lote (`area=rotaer&type=AD`). Traz os mesmos dados
 * cadastrais do detalhamento, menos as pistas (research R3).
 */
export interface AirportCatalogEntry {
  readonly icao: string;
  readonly name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /**
   * `<dt>` do registro ROTAER (`AAAA-MM-DD`): data da última alteração do
   * aeródromo, igual na listagem e no detalhamento. `null` se ausente.
   */
  readonly updatedOn: string | null;
}

export interface AirportCatalogPage {
  /** `rotaer/@total`: o tamanho do catálogo inteiro, não da página. */
  readonly total: number;
  readonly entries: readonly AirportCatalogEntry[];
  /** Itens descartados por falta de `AeroCode` ou `name`, descritos para o resumo. */
  readonly rejected: readonly string[];
}

/** Todas as cartas IFR publicadas, numa só consulta (research R2). */
export interface IfrChartCatalog {
  /** `lastupdate` normalizado (`AAAA-MM-DD HH:MM:SS`); global ao conjunto IFR. */
  readonly lastUpdate: string | null;
  /** `emenda` normalizada: data do ciclo AIRAC vigente. */
  readonly airacCycle: string | null;
  readonly charts: readonly ChartSummary[];
}

export interface AisWebClient {
  /** Uma página do catálogo `type=AD`, já com os dados cadastrais. */
  listAirports(offset: number, limit: number): Promise<AirportCatalogPage>;
  /** Todas as cartas IFR. Lança erro retentável se a resposta vier truncada. */
  fetchIfrChartCatalog(): Promise<IfrChartCatalog>;
  /** Detalhamento de um aeródromo; a rotina o consulta só pelas pistas. */
  fetchAirport(icao: string): Promise<AirportDetails>;
  downloadChart(chart: ChartSummary): Promise<Uint8Array>;
}
