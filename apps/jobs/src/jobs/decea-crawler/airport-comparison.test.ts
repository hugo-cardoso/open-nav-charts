import type { Airport, AirportProcedure } from "@open-nav-charts/domain";
import { describe, expect, it } from "vitest";
import { catalogEntry, chart } from "../../testing/doubles.js";
import {
  sameCatalogData,
  sameProcedures,
  sameRunways,
  toAirport,
  toProcedure,
} from "./airport-comparison.js";

/** Como o banco devolve: coordenadas com as 6 casas de `numeric(9,6)`. */
const persisted: Airport = {
  icao: "SBGL",
  name: "Galeão - Antônio Carlos Jobim",
  city: "Rio de Janeiro",
  state: "RJ",
  country: "BR",
  latitude: -22.81,
  longitude: -43.250556,
  runways: [
    { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
    { ident: "15/33", lengthMeters: 3180, widthMeters: 47 },
  ],
};

const source = catalogEntry({
  icao: "SBGL",
  name: "Galeão - Antônio Carlos Jobim",
  city: "Rio de Janeiro",
  state: "RJ",
  // Como a fonte publica: 12 casas.
  latitude: -22.81,
  longitude: -43.250555555556,
});

function procedure(overrides: Partial<AirportProcedure> = {}): AirportProcedure {
  return {
    ...toProcedure(chart({ id: "c1" }), "SBGL/c1.pdf", new Date("2026-08-15T12:00:00Z")),
    ...overrides,
  };
}

describe("sameCatalogData", () => {
  it("considera igual a coordenada da fonte com 12 casas e a persistida com 6", () => {
    expect(sameCatalogData(source, persisted)).toBe(true);
  });

  it("detecta nome diferente", () => {
    expect(sameCatalogData({ ...source, name: "Galeão" }, persisted)).toBe(false);
  });

  it("detecta cidade, UF e coordenada diferentes", () => {
    expect(sameCatalogData({ ...source, city: "Niterói" }, persisted)).toBe(false);
    expect(sameCatalogData({ ...source, state: "SP" }, persisted)).toBe(false);
    expect(sameCatalogData({ ...source, latitude: -22.82 }, persisted)).toBe(false);
  });

  it("trata meia coordenada da fonte como nenhuma", () => {
    const withoutCoordinates: Airport = { ...persisted, latitude: null, longitude: null };

    expect(sameCatalogData({ ...source, longitude: null }, withoutCoordinates)).toBe(true);
  });

  it("detecta registro legado sem país", () => {
    expect(sameCatalogData(source, { ...persisted, country: null })).toBe(false);
  });

  it("ignora a data de alteração do registro, que não é dado do aeródromo", () => {
    expect(sameCatalogData({ ...source, updatedOn: "2030-01-01" }, persisted)).toBe(true);
  });
});

describe("sameRunways", () => {
  it("considera iguais as mesmas pistas em outra ordem", () => {
    expect(sameRunways([...persisted.runways].reverse(), persisted.runways)).toBe(true);
  });

  it("detecta largura, comprimento ou pista diferente", () => {
    const [first, second] = persisted.runways;
    if (first === undefined || second === undefined) {
      throw new Error("fixture sem pistas");
    }

    expect(sameRunways([{ ...first, widthMeters: 60 }, second], persisted.runways)).toBe(false);
    expect(sameRunways([{ ...first, lengthMeters: null }, second], persisted.runways)).toBe(false);
    expect(sameRunways([first], persisted.runways)).toBe(false);
  });
});

describe("sameProcedures", () => {
  it("considera iguais as mesmas cartas mesmo com archivedAt diferente", () => {
    expect(
      sameProcedures([procedure({ archivedAt: new Date("2030-01-01T00:00:00Z") })], [procedure()]),
    ).toBe(true);
  });

  it("detecta carta incluída e carta retirada", () => {
    const other = procedure({ id: "c2" });

    expect(sameProcedures([procedure(), other], [procedure()])).toBe(false);
    expect(sameProcedures([procedure()], [procedure(), other])).toBe(false);
  });

  it("detecta emenda, nome, tipo, link ou chave diferentes", () => {
    for (const change of [
      { amendment: "2610A1" },
      { name: "Outra" },
      { type: "SID" },
      { sourceUrl: "https://outro" },
      { storageKey: null },
    ] satisfies Partial<AirportProcedure>[]) {
      expect(sameProcedures([procedure(change)], [procedure()])).toBe(false);
    }
  });
});

describe("toAirport", () => {
  it("monta o aeródromo com os dados do catálogo, o país da fonte e as pistas dadas", () => {
    const airport = toAirport(source, persisted.runways);

    expect(airport).toEqual({
      icao: "SBGL",
      name: source.name,
      city: source.city,
      state: source.state,
      country: "BR",
      latitude: source.latitude,
      longitude: source.longitude,
      runways: persisted.runways,
    });
  });
});
