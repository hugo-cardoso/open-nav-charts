import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { procedureCollection } from "../../../shared/testing/api-fixtures.js";
import { buildChartUrl, listProcedures } from "./procedures.js";

const BASE_URL = "http://api.test";

function requestedUrl(): string {
  return vi.mocked(fetch).mock.calls[0]?.[0] as string;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(procedureCollection), {
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

describe("listProcedures", () => {
  it("normaliza o ICAO no caminho", async () => {
    await listProcedures("sbgl", null, { baseUrl: BASE_URL });

    expect(requestedUrl()).toBe("http://api.test/v1/airports/SBGL/procedures");
  });

  it("omite o tipo quando ausente", async () => {
    await listProcedures("SBGL", null, { baseUrl: BASE_URL });

    expect(requestedUrl()).not.toContain("type=");
  });

  it("normaliza o tipo para maiúsculas", async () => {
    await listProcedures("SBGL", "iac", { baseUrl: BASE_URL });

    expect(requestedUrl()).toContain("type=IAC");
  });

  it("devolve a coleção da API", async () => {
    await expect(listProcedures("SBGL", null, { baseUrl: BASE_URL })).resolves.toEqual(
      procedureCollection,
    );
  });
});

describe("buildChartUrl", () => {
  it("monta a URL da carta no formato do contrato", () => {
    expect(buildChartUrl(BASE_URL, "SBGL", "12345")).toBe(
      "http://api.test/v1/airports/SBGL/procedures/12345/chart",
    );
  });

  it("normaliza o ICAO", () => {
    expect(buildChartUrl(BASE_URL, "sbgl", "12345")).toContain("/airports/SBGL/");
  });

  it("escapa identificadores com caracteres especiais", () => {
    expect(buildChartUrl(BASE_URL, "SBGL", "a/b c")).toContain("/procedures/a%2Fb%20c/chart");
  });

  /**
   * Prova de FR-017: montar a URL não pode disparar requisição. Se disparasse, a
   * assinatura de 300 s começaria a contar antes do clique do usuário.
   */
  it("não emite nenhuma requisição", () => {
    buildChartUrl(BASE_URL, "SBGL", "12345");

    expect(fetch).not.toHaveBeenCalled();
  });
});
