import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeIcao } from "../../../shared/domain/icao.js";
import { airportPage, completeAirportDetail } from "../../../shared/testing/api-fixtures.js";
import { getAirport, listAirports } from "./airports.js";

const BASE_URL = "http://api.test";

function requestedUrl(): string {
  return vi.mocked(fetch).mock.calls[0]?.[0] as string;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(airportPage), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeIcao", () => {
  it("normaliza caixa e espaços", () => {
    expect(normalizeIcao(" sbgl ")).toBe("SBGL");
  });
});

describe("listAirports", () => {
  it("omite todos os parâmetros quando a consulta está vazia", async () => {
    await listAirports({}, { baseUrl: BASE_URL });

    expect(requestedUrl()).toBe("http://api.test/v1/airports");
  });

  /** `page=1` é o padrão da API; enviá-lo só polui a URL e a chave de cache. */
  it("omite a página quando é a primeira", async () => {
    await listAirports({ page: 1 }, { baseUrl: BASE_URL });

    expect(requestedUrl()).not.toContain("page=");
  });

  it("envia a página quando não é a primeira", async () => {
    await listAirports({ page: 3 }, { baseUrl: BASE_URL });

    expect(requestedUrl()).toContain("page=3");
  });

  it("normaliza estado e país para maiúsculas", async () => {
    await listAirports({ state: "rj", country: "br" }, { baseUrl: BASE_URL });

    const url = requestedUrl();
    expect(url).toContain("state=RJ");
    expect(url).toContain("country=BR");
  });

  it("omite termo de busca composto apenas de espaços", async () => {
    await listAirports({ search: "   " }, { baseUrl: BASE_URL });

    expect(requestedUrl()).not.toContain("search=");
  });

  it("devolve o envelope paginado da API", async () => {
    await expect(listAirports({ search: "SBGL" }, { baseUrl: BASE_URL })).resolves.toEqual(
      airportPage,
    );
  });
});

describe("getAirport", () => {
  it("normaliza o ICAO no caminho", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(completeAirportDetail), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    await getAirport("sbgl", { baseUrl: BASE_URL });

    expect(requestedUrl()).toBe("http://api.test/v1/airports/SBGL");
  });
});
