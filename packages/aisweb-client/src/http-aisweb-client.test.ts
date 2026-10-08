import { describe, expect, it } from "vitest";
import type { ChartSummary } from "./aisweb-client.js";
import { AuthenticationSourceError, PermanentSourceError, RetryableSourceError } from "./errors.js";
import { HttpAisWebClient } from "./http-aisweb-client.js";

const credentials = { apiKey: "chave", apiPass: "senha" } as const;

/** Dublê de `fetch`: registra as URLs chamadas e devolve respostas roteirizadas. */
function stubFetch(handler: (url: string) => Response | Promise<Response>): {
  fetch: typeof fetch;
  urls: string[];
} {
  const urls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    urls.push(url);
    return handler(url);
  }) as typeof fetch;
  return { fetch: impl, urls };
}

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/xml" } });
}

function clientWith(handler: (url: string) => Response | Promise<Response>): {
  client: HttpAisWebClient;
  urls: string[];
} {
  const stub = stubFetch(handler);
  return {
    client: new HttpAisWebClient({ ...credentials, fetch: stub.fetch }),
    urls: stub.urls,
  };
}

const airportXml = `<aisweb><AeroCode>SBGL</AeroCode><name>Galeão</name></aisweb>`;

describe("HttpAisWebClient", () => {
  describe("montagem das requisições", () => {
    it("envia as credenciais em toda consulta", async () => {
      const { client, urls } = clientWith(() => xmlResponse(airportXml));

      await client.fetchAirport("SBGL");

      const url = new URL(urls[0] ?? "");
      expect(url.searchParams.get("apiKey")).toBe("chave");
      expect(url.searchParams.get("apiPass")).toBe("senha");
      expect(url.searchParams.get("area")).toBe("rotaer");
      expect(url.searchParams.get("icaoCode")).toBe("SBGL");
    });
  });

  describe("consultas em lote", () => {
    it("pede uma página do catálogo com área, tipo e paginação", async () => {
      const { client, urls } = clientWith(() =>
        xmlResponse(
          `<aisweb><rotaer total="4491"><item><AeroCode>SBGL</AeroCode><name>Galeão</name><dt>2026-10-08</dt></item></rotaer></aisweb>`,
        ),
      );

      const page = await client.listAirports(0, 5000);

      const url = new URL(urls[0] ?? "");
      expect(url.searchParams.get("area")).toBe("rotaer");
      expect(url.searchParams.get("type")).toBe("AD");
      expect(url.searchParams.get("rowstart")).toBe("0");
      expect(url.searchParams.get("rowend")).toBe("5000");
      expect(page.total).toBe(4491);
      expect(page.entries.map((entry) => entry.icao)).toEqual(["SBGL"]);
    });

    it("pede todas as cartas IFR sem aeródromo nem paginação", async () => {
      const { client, urls } = clientWith(() =>
        xmlResponse(
          `<aisweb><cartas emenda=" 2026-10-01 " lastupdate=" {ts '2026-09-30 17:35:34'} " total="0"></cartas></aisweb>`,
        ),
      );

      const catalog = await client.fetchIfrChartCatalog();

      const url = new URL(urls[0] ?? "");
      expect(url.searchParams.get("area")).toBe("cartas");
      expect(url.searchParams.get("especie")).toBe("IFR");
      expect(url.searchParams.get("icaoCode")).toBeNull();
      // `especie` seleciona IFR/VFR; `tipo` é a sigla da carta, outra dimensão.
      expect(url.searchParams.get("tipo")).toBeNull();
      expect(url.searchParams.get("rowstart")).toBeNull();
      expect(url.searchParams.get("rowend")).toBeNull();
      expect(catalog.lastUpdate).toBe("2026-09-30 17:35:34");
      expect(catalog.airacCycle).toBe("2026-10-01");
    });

    it("classifica o status do lote de cartas como as demais consultas", async () => {
      const unavailable = clientWith(() => xmlResponse("", 503)).client;
      const rejected = clientWith(() => xmlResponse("", 401)).client;

      await expect(unavailable.fetchIfrChartCatalog()).rejects.toBeInstanceOf(RetryableSourceError);
      await expect(rejected.fetchIfrChartCatalog()).rejects.toBeInstanceOf(
        AuthenticationSourceError,
      );
    });
  });

  describe("classificação de erro por status", () => {
    it("trata 500 como retentável", async () => {
      const { client } = clientWith(() => xmlResponse("erro", 500));

      await expect(client.fetchAirport("SBGL")).rejects.toBeInstanceOf(RetryableSourceError);
    });

    it("trata 503 como retentável", async () => {
      const { client } = clientWith(() => xmlResponse("erro", 503));

      await expect(client.fetchAirport("SBGL")).rejects.toBeInstanceOf(RetryableSourceError);
    });

    it("trata 429 como retentável", async () => {
      const { client } = clientWith(() => xmlResponse("limite", 429));

      await expect(client.fetchAirport("SBGL")).rejects.toBeInstanceOf(RetryableSourceError);
    });

    it("trata falha de rede como retentável", async () => {
      const { client } = clientWith(() => {
        throw new TypeError("fetch failed");
      });

      await expect(client.fetchAirport("SBGL")).rejects.toBeInstanceOf(RetryableSourceError);
    });

    it("trata 404 como definitivo", async () => {
      const { client } = clientWith(() => xmlResponse("nao encontrado", 404));

      await expect(client.fetchAirport("SBGL")).rejects.toBeInstanceOf(PermanentSourceError);
    });

    it("trata 400 como definitivo", async () => {
      const { client } = clientWith(() => xmlResponse("requisicao invalida", 400));

      await expect(client.fetchAirport("SBGL")).rejects.toBeInstanceOf(PermanentSourceError);
    });

    it("trata 401 como falha de autenticação, que aborta a rotina", async () => {
      const { client } = clientWith(() => xmlResponse("nao autorizado", 401));

      await expect(client.fetchAirport("SBGL")).rejects.toBeInstanceOf(AuthenticationSourceError);
    });

    it("trata 403 como falha de autenticação, que aborta a rotina", async () => {
      const { client } = clientWith(() => xmlResponse("proibido", 403));

      await expect(client.fetchAirport("SBGL")).rejects.toBeInstanceOf(AuthenticationSourceError);
    });
  });

  describe("fetchAirport", () => {
    it("devolve o detalhamento parseado", async () => {
      const { client } = clientWith(() => xmlResponse(airportXml));

      const airport = await client.fetchAirport("SBGL");

      expect(airport.icao).toBe("SBGL");
      expect(airport.name).toBe("Galeão");
    });
  });

  describe("downloadChart", () => {
    const chart: ChartSummary = {
      id: "abc123",
      airportIcao: "SBGL",
      name: "RNP Y RWY 28",
      type: "IAC",
      amendment: "2601A1",
      link: "https://aisweb.decea.gov.br/download/?arquivo=abc123&apikey=chave",
    };

    it("baixa pelo link publicado pela fonte", async () => {
      const { client, urls } = clientWith(() => new Response(new Uint8Array([1, 2, 3])));

      const content = await client.downloadChart(chart);

      expect(urls[0]).toBe(chart.link);
      expect([...content]).toEqual([1, 2, 3]);
    });

    it("recorre à URL derivada do id quando o link falta", async () => {
      const { client, urls } = clientWith(() => new Response(new Uint8Array([1])));

      await client.downloadChart({ ...chart, link: null });

      const url = new URL(urls[0] ?? "");
      expect(url.searchParams.get("arquivo")).toBe("abc123");
      expect(url.searchParams.get("apikey")).toBe("chave");
    });

    it("recorre à URL derivada quando o host do link não responde", async () => {
      // Observado em 2026-10-08: `aisweb.decea.gov.br`, host dos links, deixou de
      // resolver em parte dos DNS públicos, enquanto `aisweb.decea.mil.br` responde.
      const { client, urls } = clientWith((url) => {
        if (url.startsWith("https://aisweb.decea.gov.br")) {
          throw new TypeError("fetch failed");
        }
        return new Response(new Uint8Array([7]));
      });

      const content = await client.downloadChart(chart);

      expect(urls).toHaveLength(2);
      expect(new URL(urls[1] ?? "").host).toBe("aisweb.decea.mil.br");
      expect([...content]).toEqual([7]);
    });

    it("não troca de URL quando o link responde com erro HTTP", async () => {
      const { client, urls } = clientWith(() => new Response("erro", { status: 503 }));

      await expect(client.downloadChart(chart)).rejects.toBeInstanceOf(RetryableSourceError);
      expect(urls).toHaveLength(1);
    });

    it("trata 500 no download como retentável", async () => {
      const { client } = clientWith(() => new Response("erro", { status: 500 }));

      await expect(client.downloadChart(chart)).rejects.toBeInstanceOf(RetryableSourceError);
    });

    it("trata 404 no download como definitivo", async () => {
      const { client } = clientWith(() => new Response("nao encontrado", { status: 404 }));

      await expect(client.downloadChart(chart)).rejects.toBeInstanceOf(PermanentSourceError);
    });
  });
});
