import type { AirportDetails, AisWebClient, ChartSummary } from "./aisweb-client.js";
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

  async countAirports(): Promise<number> {
    const xml = await this.getText(
      this.apiUrl({ area: "rotaer", type: "AD", rowstart: "0", rowend: "1" }),
    );
    return this.rotaerParser.parseList(xml).total;
  }

  async listAirportIcaos(offset: number, limit: number): Promise<readonly string[]> {
    const xml = await this.getText(
      this.apiUrl({
        area: "rotaer",
        type: "AD",
        rowstart: String(offset),
        rowend: String(limit),
      }),
    );
    return this.rotaerParser.parseList(xml).icaos;
  }

  async fetchAirport(icao: string): Promise<AirportDetails> {
    const xml = await this.getText(this.apiUrl({ area: "rotaer", icaoCode: icao }));
    return this.rotaerParser.parseAirport(xml);
  }

  async fetchIfrCharts(icao: string): Promise<readonly ChartSummary[]> {
    // `especie` é a única fonte da distinção IFR/VFR — `tipo` seleciona a sigla
    // da carta, que é outra dimensão (research R2).
    const xml = await this.getText(this.apiUrl({ area: "cartas", icaoCode: icao, especie: "IFR" }));
    return this.chartsParser.parse(xml, icao);
  }

  async downloadChart(chart: ChartSummary): Promise<Uint8Array> {
    const url = chart.link ?? this.derivedDownloadUrl(chart.id);
    const response = await this.get(url);
    const buffer = await response.arrayBuffer().catch((cause: unknown) => {
      throw new RetryableSourceError(`falha ao ler o documento da carta ${chart.id}`, { cause });
    });
    return new Uint8Array(buffer);
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
      throw new RetryableSourceError(`falha de rede ao acessar a fonte: ${describe(cause)}`, {
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
