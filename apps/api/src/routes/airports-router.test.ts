import request from "supertest";
import { describe, expect, it } from "vitest";
import { airport } from "../testing/doubles.js";
import { createTestApp } from "../testing/test-app.js";

function appWith(airports: readonly ReturnType<typeof airport>[]) {
  return createTestApp({ airports }).app;
}

const catalog = [
  airport({ icao: "SBBR", name: "Presidente Juscelino Kubitschek", city: "Brasília", state: "DF" }),
  airport({ icao: "SBGL", name: "Rio de Janeiro / Galeão", city: "Rio de Janeiro", state: "RJ" }),
  airport({ icao: "SBRJ", name: "Santos Dumont", city: "Rio de Janeiro", state: "RJ" }),
  airport({ icao: "SBSP", name: "Congonhas", city: "São Paulo", state: "SP" }),
];

describe("GET /v1/airports", () => {
  it("devolve a primeira página com tamanho padrão de 20", async () => {
    const response = await request(appWith(catalog)).get("/v1/airports");

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(1);
    expect(response.body.pageSize).toBe(20);
    expect(response.body.total).toBe(4);
    expect(response.body.hasNext).toBe(false);
    expect(response.body.items).toHaveLength(4);
  });

  it("ordena por ICAO ascendente", async () => {
    const response = await request(appWith(catalog)).get("/v1/airports");

    expect(response.body.items.map((item: { icao: string }) => item.icao)).toEqual([
      "SBBR",
      "SBGL",
      "SBRJ",
      "SBSP",
    ]);
  });

  it("calcula hasNext e total corretamente ao paginar", async () => {
    const app = appWith(catalog);

    const first = await request(app).get("/v1/airports?page=1&pageSize=2");
    const last = await request(app).get("/v1/airports?page=2&pageSize=2");

    expect(first.body.hasNext).toBe(true);
    expect(first.body.total).toBe(4);
    expect(last.body.hasNext).toBe(false);
    expect(last.body.items.map((item: { icao: string }) => item.icao)).toEqual(["SBRJ", "SBSP"]);
  });

  it("percorre todas as páginas sem repetir nem omitir (SC-008)", async () => {
    const app = appWith(catalog);
    const seen: string[] = [];

    for (let page = 1; page <= 4; page += 1) {
      const response = await request(app).get(`/v1/airports?page=${page}&pageSize=1`);
      seen.push(...response.body.items.map((item: { icao: string }) => item.icao));
    }

    expect(new Set(seen).size).toBe(4);
  });

  it("devolve items vazio com 200 para página além do fim", async () => {
    const response = await request(appWith(catalog)).get("/v1/airports?page=99");

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(4);
  });

  it("devolve acervo vazio com 200 e total zero", async () => {
    const response = await request(appWith([])).get("/v1/airports");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasNext: false,
    });
  });

  it("não inclui runways nos itens da listagem (FR-008)", async () => {
    const response = await request(
      appWith([
        airport({
          icao: "SBGL",
          runways: [{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }],
        }),
      ]),
    ).get("/v1/airports");

    expect(response.body.items[0]).not.toHaveProperty("runways");
    expect(JSON.stringify(response.body)).not.toContain("runways");
  });

  it("cada item traz location, sem os campos planos (FR-007, FR-009)", async () => {
    const response = await request(appWith([airport({ icao: "SBGL" })])).get("/v1/airports");

    const item = response.body.items[0];
    expect(item.location).toEqual({
      city: "Cidade",
      state: "RJ",
      country: "BR",
      latitude: -22.809999,
      longitude: -43.250556,
    });
    for (const field of ["city", "state", "country", "latitude", "longitude"]) {
      expect(item).not.toHaveProperty(field);
    }
  });

  it("filtra por unidade federativa, insensível a caixa (FR-005)", async () => {
    const response = await request(appWith(catalog)).get("/v1/airports?state=rj");

    expect(response.body.items.map((item: { icao: string }) => item.icao)).toEqual([
      "SBGL",
      "SBRJ",
    ]);
    expect(response.body.total).toBe(2);
  });

  it("busca sem acento encontra registro acentuado (FR-006)", async () => {
    const app = appWith(catalog);

    for (const termo of ["galeao", "GALEÃO", "Galeao"]) {
      const response = await request(app).get(`/v1/airports?search=${encodeURIComponent(termo)}`);
      expect(response.body.items.map((item: { icao: string }) => item.icao)).toEqual(["SBGL"]);
    }
  });

  it("busca casa também ICAO e cidade", async () => {
    const app = appWith(catalog);

    const porIcao = await request(app).get("/v1/airports?search=sbsp");
    const porCidade = await request(app).get("/v1/airports?search=sao%20paulo");

    expect(porIcao.body.items.map((item: { icao: string }) => item.icao)).toEqual(["SBSP"]);
    expect(porCidade.body.items.map((item: { icao: string }) => item.icao)).toEqual(["SBSP"]);
  });

  it("recusa pageSize acima de 100 com 400 INVALID_PAGINATION (FR-003)", async () => {
    const response = await request(appWith(catalog)).get("/v1/airports?pageSize=500");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PAGINATION");
    expect(response.body.error.message).toContain("100");
  });

  it("recusa page inválida com 400 INVALID_PAGINATION", async () => {
    for (const query of ["page=0", "page=-1", "page=abc", "pageSize=0"]) {
      const response = await request(appWith(catalog)).get(`/v1/airports?${query}`);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_PAGINATION");
    }
  });

  it("recusa state fora do formato com 400 INVALID_STATE", async () => {
    const response = await request(appWith(catalog)).get("/v1/airports?state=RJX");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_STATE");
  });

  it("filtra por país, insensível a caixa (FR-014, FR-016)", async () => {
    const app = appWith([
      airport({ icao: "SBGL", country: "BR" }),
      airport({ icao: "LPPT", country: "PT" }),
      airport({ icao: "SWXX", country: null }),
    ]);

    for (const value of ["BR", "br", " br "]) {
      const response = await request(app).get(`/v1/airports?country=${encodeURIComponent(value)}`);
      expect(response.body.items.map((item: { icao: string }) => item.icao)).toEqual(["SBGL"]);
      expect(response.body.total).toBe(1);
    }
  });

  it("responde 200 com lista vazia para país sem correspondência (FR-021)", async () => {
    const response = await request(appWith(catalog)).get("/v1/airports?country=XX");

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it("recusa country fora do formato com 400 INVALID_COUNTRY (FR-018)", async () => {
    for (const value of ["Brazil", "BRA", "B", "B1"]) {
      const response = await request(appWith(catalog)).get(`/v1/airports?country=${value}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_COUNTRY");
    }
  });

  it("recusa search vazia ou longa demais com 400 INVALID_SEARCH", async () => {
    const app = appWith(catalog);

    const vazia = await request(app).get("/v1/airports?search=");
    const longa = await request(app).get(`/v1/airports?search=${"a".repeat(101)}`);

    expect(vazia.body.error.code).toBe("INVALID_SEARCH");
    expect(longa.body.error.code).toBe("INVALID_SEARCH");
  });
});

describe("GET /v1/airports/:icao", () => {
  it("devolve o detalhe com as pistas", async () => {
    const response = await request(
      appWith([
        airport({
          icao: "SBGL",
          name: "Rio de Janeiro / Galeão",
          runways: [
            { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
            { ident: "15/33", lengthMeters: 3180, widthMeters: 47 },
          ],
        }),
      ]),
    ).get("/v1/airports/SBGL");

    expect(response.status).toBe(200);
    expect(response.body.icao).toBe("SBGL");
    expect(response.body.name).toBe("Rio de Janeiro / Galeão");
    expect(response.body.runways).toHaveLength(2);
  });

  it("ICAO em minúsculas devolve o mesmo recurso (FR-011)", async () => {
    const app = appWith([airport({ icao: "SBGL" })]);

    const maiusculas = await request(app).get("/v1/airports/SBGL");
    const minusculas = await request(app).get("/v1/airports/sbgl");

    expect(minusculas.status).toBe(200);
    expect(minusculas.body).toEqual(maiusculas.body);
  });

  it("aeródromo sem pistas devolve runways vazio, não erro", async () => {
    const response = await request(appWith([airport({ icao: "SBGL", runways: [] })])).get(
      "/v1/airports/SBGL",
    );

    expect(response.status).toBe(200);
    expect(response.body.runways).toEqual([]);
  });

  it("coordenadas ausentes vêm como null explícito dentro de location", async () => {
    const response = await request(
      appWith([
        airport({
          icao: "SBGL",
          latitude: null,
          longitude: null,
          city: null,
          state: null,
          country: null,
        }),
      ]),
    ).get("/v1/airports/SBGL");

    expect(response.body.location).toEqual({
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
    });
    expect(Object.keys(response.body.location)).toContain("latitude");
  });

  it("agrupa a localização em location, fora do nível superior (FR-007, FR-009)", async () => {
    const response = await request(appWith([airport({ icao: "SBGL" })])).get("/v1/airports/SBGL");

    expect(response.body.location).toEqual({
      city: "Cidade",
      state: "RJ",
      country: "BR",
      latitude: -22.809999,
      longitude: -43.250556,
    });
    for (const field of ["city", "state", "country", "latitude", "longitude"]) {
      expect(response.body).not.toHaveProperty(field);
    }
  });

  it("recusa ICAO malformado com 400 INVALID_ICAO", async () => {
    const response = await request(appWith(catalog)).get("/v1/airports/XX");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ICAO");
  });

  it("devolve 404 AIRPORT_NOT_FOUND para ICAO válido inexistente (FR-012)", async () => {
    const response = await request(appWith(catalog)).get("/v1/airports/SBXX");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("AIRPORT_NOT_FOUND");
    expect(response.body.error.message).toContain("SBXX");
  });
});
