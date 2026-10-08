import type {
  AirportCatalogPage,
  AirportDetails,
  AisWebClient,
  ChartSummary,
  IfrChartCatalog,
} from "./aisweb-client.js";
import { AuthenticationSourceError, PermanentSourceError, RetryableSourceError } from "./errors.js";
import { ChartsParser } from "./parsers/charts-parser.js";
import { RotaerParser } from "./parsers/rotaer-parser.js";

const DEFAULT_BASE_URL = "https://aisweb.decea.mil.br/api/";
const DEFAULT_DOWNLOAD_URL = "https://aisweb.decea.mil.br/download/";

export interface HttpAisWebClientOptions {
  readonly apiKey: string;
  readonly apiPass: string;
  /** Injetado para manter os testes sem rede (Princípio III e IV). */
  readonly fetch: typeof globalThis.fetch;
  readonly baseUrl?: string;
  readonly downloadUrl?: string;
  readonly timeoutMs?: number;
}

/**
 * Único ponto do sistema que conhece XML, credenciais e nomes de campo da
 * AISWEB. Traduz status HTTP para os erros tipados que a política de tentativas
 * consome.
 */
export class HttpAisWebClient implements AisWebClient {
  private readonly apiKey: string;
  private readonly apiPass: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly baseUrl: string;
  private readonly downloadUrl: string;
  private readonly timeoutMs: number;
  private readonly rotaerParser = new RotaerParser();
  private readonly chartsParser = new ChartsParser();

  constructor(options: HttpAisWebClientOptions) {
    this.apiKey = options.apiKey;
    this.apiPass = options.apiPass;
    this.fetch = options.fetch;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.downloadUrl = options.downloadUrl ?? DEFAULT_DOWNLOAD_URL;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async listAirports(offset: number, limit: number): Promise<AirportCatalogPage> {
    const xml = await this.getText(
      this.apiUrl({
        area: "rotaer",
        type: "AD",
        rowstart: String(offset),
        rowend: String(limit),
      }),
    );
    return this.rotaerParser.parseCatalog(xml);
  }

  async fetchIfrChartCatalog(): Promise<IfrChartCatalog> {
    // Sem `icaoCode` a fonte devolve todas as cartas da espécie de uma vez, e
    // ignora `rowstart`/`rowend` — por isso nem são enviados (research R2).
    const xml = await this.getText(this.apiUrl({ area: "cartas", especie: "IFR" }));
    return this.chartsParser.parseCatalog(xml);
  }

  async fetchAirport(icao: string): Promise<AirportDetails> {
    const xml = await this.getText(this.apiUrl({ area: "rotaer", icaoCode: icao }));
    return this.rotaerParser.parseAirport(xml);
  }

  async downloadChart(chart: ChartSummary): Promise<Uint8Array> {
    const response = await this.getDocument(chart);
    const buffer = await response.arrayBuffer().catch((cause: unknown) => {
      throw new RetryableSourceError(`falha ao ler o documento da carta ${chart.id}`, { cause });
    });
    return new Uint8Array(buffer);
  }

  /**
   * O `<link>` publicado aponta para `aisweb.decea.gov.br`, que em 2026-10-08
   * deixou de resolver em parte dos DNS públicos. Falha de rede nele recorre à
   * URL derivada do id no host da API; erro HTTP não — o host respondeu, e a
   * resposta vale.
   */
  private async getDocument(chart: ChartSummary): Promise<Response> {
    const derived = this.derivedDownloadUrl(chart.id);
    if (chart.link === null || chart.link === derived) {
      return this.get(derived);
    }
    try {
      return await this.get(chart.link);
    } catch (error) {
      if (!(error instanceof SourceNetworkError)) {
        throw error;
      }
      return this.get(derived);
    }
  }

  private apiUrl(params: Record<string, string>): string {
    const url = new URL(this.baseUrl);
    url.searchParams.set("apiKey", this.apiKey);
    url.searchParams.set("apiPass", this.apiPass);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private derivedDownloadUrl(id: string): string {
    const url = new URL(this.downloadUrl);
    url.searchParams.set("arquivo", id);
    url.searchParams.set("apikey", this.apiKey);
    return url.toString();
  }

  private async getText(url: string): Promise<string> {
    const response = await this.get(url);
    return response.text().catch((cause: unknown) => {
      throw new RetryableSourceError("falha ao ler o corpo da resposta da fonte", { cause });
    });
  }

  private async get(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: "text/xml, application/xml, application/pdf, */*" },
      });
    } catch (cause) {
      // Timeout, DNS e conexão recusada chegam aqui e são todos retentáveis.
      throw new SourceNetworkError(`falha de rede ao acessar a fonte: ${describe(cause)}`, {
        cause,
      });
    }

    if (response.ok) {
      return response;
    }
    throw this.toError(response.status, url);
  }

  private toError(status: number, url: string): Error {
    const where = redact(url);
    if (status === 401 || status === 403) {
      return new AuthenticationSourceError(
        `credencial da AISWEB rejeitada (HTTP ${status}) em ${where}`,
      );
    }
    if (status === 429 || status >= 500) {
      return new RetryableSourceError(`fonte indisponível (HTTP ${status}) em ${where}`);
    }
    return new PermanentSourceError(`requisição rejeitada pela fonte (HTTP ${status}) em ${where}`);
  }
}

/** A requisição nem chegou a ter resposta. Retentável como as demais, mas distinguível. */
class SourceNetworkError extends RetryableSourceError {}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Nunca deixar credencial vazar em mensagem de erro nem em log. */
function redact(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ["apiKey", "apiPass", "apikey"]) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "***");
      }
    }
    return parsed.toString();
  } catch {
    return "url inválida";
  }
}
