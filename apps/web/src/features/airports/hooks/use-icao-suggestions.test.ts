import { describe, expect, it, vi } from "vitest";
import type { AirportSummary } from "../../../shared/api/types.js";
import { completeAirport } from "../../../shared/testing/api-fixtures.js";
import { matchesIcaoPrefix, sanitizeIcaoInput } from "./use-icao-suggestions.js";

function airport(icao: string, name = `${icao} airport`): AirportSummary {
  return { ...completeAirport, icao, name };
}

describe("sanitizeIcaoInput", () => {
  it("converte para maiúsculas", () => {
    expect(sanitizeIcaoInput("sbgr")).toBe("SBGR");
  });

  /** O ICAO é só letras: dígitos e símbolos não chegam a virar consulta. */
  it("descarta tudo que não for letra", () => {
    expect(sanitizeIcaoInput("SB-1 G@R")).toBe("SBGR");
    expect(sanitizeIcaoInput("123")).toBe("");
  });

  it("limita a quatro caracteres", () => {
    expect(sanitizeIcaoInput("SBGRXYZ")).toBe("SBGR");
  });

  it("aceita entrada vazia", () => {
    expect(sanitizeIcaoInput("")).toBe("");
  });
});

describe("restrição por país", () => {
  /**
   * O recorte por país é feito pela API, não no cliente: `country` vai no
   * parâmetro da consulta. Estes testes travam a passagem do valor — sem ela, o
   * seletor de país não teria efeito sobre as sugestões.
   */
  it("repassa o país à consulta", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(String(url));
        return Promise.resolve(
          new Response(
            JSON.stringify({ items: [], page: 1, pageSize: 24, total: 0, hasNext: false }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }),
    );

    const { listAirports } = await import("../api/airports.js");
    await listAirports({ search: "SB", country: "BR" }, { baseUrl: "http://api.test" });

    expect(calls[0]).toContain("country=BR");
    vi.unstubAllGlobals();
  });

  it("omite o país quando nenhum está selecionado", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(String(url));
        return Promise.resolve(
          new Response(
            JSON.stringify({ items: [], page: 1, pageSize: 24, total: 0, hasNext: false }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }),
    );

    const { listAirports } = await import("../api/airports.js");
    await listAirports({ search: "SB", country: null }, { baseUrl: "http://api.test" });

    expect(calls[0]).not.toContain("country=");
    vi.unstubAllGlobals();
  });
});

describe("matchesIcaoPrefix", () => {
  it("aceita o código que começa com o prefixo", () => {
    expect(matchesIcaoPrefix(airport("SBGR"), "SB")).toBe(true);
    expect(matchesIcaoPrefix(airport("SBGR"), "SBGR")).toBe(true);
  });

  it("recusa quando o prefixo não está no início", () => {
    expect(matchesIcaoPrefix(airport("SBGR"), "GR")).toBe(false);
  });

  it("ignora a caixa em ambos os lados", () => {
    expect(matchesIcaoPrefix(airport("SBGR"), "sb")).toBe(true);
  });

  /**
   * A API casa código **e** nome no mesmo parâmetro. Este filtro é o que cumpre
   * a promessa da interface de buscar apenas por ICAO: sem ele, procurar "GU"
   * traria Guarulhos, cujo código não começa por "GU".
   */
  it("descarta resultado que casou apenas pelo nome", () => {
    const guarulhos = airport("SBGR", "Guarulhos - Governador André Franco Montoro");

    expect(matchesIcaoPrefix(guarulhos, "GU")).toBe(false);
  });
});
