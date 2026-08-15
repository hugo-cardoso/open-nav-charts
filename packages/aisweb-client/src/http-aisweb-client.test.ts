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

const listXml = `<aisweb><rotaer total="4550"><item><AeroCode>SBGR</AeroCode></item></rotaer></aisweb>`;
const airportXml = `<aisweb><AeroCode>SBGL</AeroCode><name>Galeão</name></aisweb>`;

describe("HttpAisWebClient", () => {
  describe("montagem das requisições", () => {
    it("envia credenciais, área e paginação na listagem", async () => {
      const { client, urls } = clientWith(() => xmlResponse(listXml));

      await client.listAirportIcaos(200, 100);

      const url = new URL(urls[0] ?? "");
      expect(url.searchParams.get("apiKey")).toBe("chave");
      expect(url.searchParams.get("apiPass")).toBe("senha");
      expect(url.searchParams.get("area")).toBe("rotaer");
      expect(url.searchParams.get("type")).toBe("AD");
      expect(url.searchParams.get("rowstart")).toBe("200");
      expect(url.searchParams.get("rowend")).toBe("100");
    });

    it("filtra cartas por especie=IFR, e não por tipo", async () => {
      const { client, urls } = clientWith(() =>
        xmlResponse(`<aisweb><cartas total="0"></cartas></aisweb>`),
      );

      await client.fetchIfrCharts("SBGL");

      const url = new URL(urls[0] ?? "");
      expect(url.searchParams.get("area")).toBe("cartas");
      expect(url.searchParams.get("icaoCode")).toBe("SBGL");
      expect(url.searchParams.get("especie")).toBe("IFR");
      expect(url.searchParams.get("tipo")).toBeNull();
    });

    it("lê o total do catálogo sem trazer a página inteira", async () => {
      const { client } = clientWith(() => xmlResponse(listXml));

      expect(await client.countAirports()).toBe(4550);
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
