import { describe, expect, it } from "vitest";
import { AirportNotFoundError } from "../http/api-error.js";
import { airport, FakeAirportRepository } from "../testing/doubles.js";
import { AirportService } from "./airport-service.js";

function service(repository: FakeAirportRepository): AirportService {
  return new AirportService({ repository });
}

describe("AirportService.list", () => {
  it("normaliza o termo de busca antes de consultar o repositório", async () => {
    const repository = new FakeAirportRepository();

    await service(repository).list({ page: 1, pageSize: 20, search: "  GALEÃO  " });

    // O termo chega ao repositório sem acento e em minúsculas — é a simetria com
    // o `search_text` gravado que faz a busca funcionar.
    expect(repository.listCalls[0]?.search).toBe("  galeao  ");
  });

  it("normaliza a unidade federativa para maiúsculas", async () => {
    const repository = new FakeAirportRepository();

    await service(repository).list({ page: 1, pageSize: 20, state: "rj" });

    expect(repository.listCalls[0]?.state).toBe("RJ");
  });

  it("normaliza o país para maiúsculas antes de consultar o repositório", async () => {
    const repository = new FakeAirportRepository();

    await service(repository).list({ page: 1, pageSize: 20, country: "br" });

    expect(repository.listCalls[0]?.country).toBe("BR");
  });

  it("repassa undefined quando filtros e busca estão ausentes", async () => {
    const repository = new FakeAirportRepository();

    await service(repository).list({ page: 2, pageSize: 50 });

    expect(repository.listCalls[0]).toEqual({
      page: 2,
      pageSize: 50,
      state: undefined,
      country: undefined,
      search: undefined,
    });
  });

  it("aplica país e UF juntos, recortando o catálogo por ambos", async () => {
    const repository = new FakeAirportRepository([
      airport({ icao: "SBGL", state: "RJ", country: "BR" }),
      airport({ icao: "SBSP", state: "SP", country: "BR" }),
      airport({ icao: "LPPT", state: "RJ", country: "PT" }),
    ]);

    const page = await service(repository).list({
      page: 1,
      pageSize: 20,
      country: "br",
      state: "rj",
    });

    expect(page.items.map((item) => item.icao)).toEqual(["SBGL"]);
    expect(page.total).toBe(1);
  });

  it("devolve os itens e o total do repositório", async () => {
    const repository = new FakeAirportRepository([
      airport({ icao: "SBGL" }),
      airport({ icao: "SBSP" }),
      airport({ icao: "SBBR" }),
    ]);

    const page = await service(repository).list({ page: 1, pageSize: 2 });

    expect(page.items.map((item) => item.icao)).toEqual(["SBBR", "SBGL"]);
    expect(page.total).toBe(3);
  });

  it("encontra aeródromo acentuado buscando sem acento", async () => {
    const repository = new FakeAirportRepository([
      airport({ icao: "SBGL", name: "Galeão", city: "Rio de Janeiro" }),
      airport({ icao: "SBSP", name: "Congonhas", city: "São Paulo" }),
    ]);

    const page = await service(repository).list({ page: 1, pageSize: 20, search: "sao paulo" });

    expect(page.items.map((item) => item.icao)).toEqual(["SBSP"]);
  });
});

describe("AirportService.findByIcao", () => {
  it("normaliza o ICAO para maiúsculas (FR-011)", async () => {
    const repository = new FakeAirportRepository([airport({ icao: "SBGL" })]);

    expect((await service(repository).findByIcao("sbgl")).icao).toBe("SBGL");
  });

  it("lança AirportNotFoundError para ICAO inexistente", async () => {
    const repository = new FakeAirportRepository();

    await expect(service(repository).findByIcao("SBXX")).rejects.toThrow(AirportNotFoundError);
  });

  it("nomeia o ICAO normalizado na mensagem do erro", async () => {
    const repository = new FakeAirportRepository();

    await expect(service(repository).findByIcao("sbxx")).rejects.toThrow("SBXX");
  });

  it("devolve o aeródromo com as pistas", async () => {
    const repository = new FakeAirportRepository([
      airport({ icao: "SBGL", runways: [{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }] }),
    ]);

    expect((await service(repository).findByIcao("SBGL")).runways).toHaveLength(1);
  });
});
