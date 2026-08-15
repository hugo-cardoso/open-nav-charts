import type { Airport, AirportProcedure } from "@open-nav-charts/domain";
import { describe, expect, it } from "vitest";
import {
  hasChart,
  toAirportDetailResponse,
  toAirportSummaryResponse,
  toPageResponse,
  toProcedureResponse,
} from "./responses.js";

function airport(overrides: Partial<Airport> = {}): Airport {
  return {
    icao: "SBGL",
    name: "Rio de Janeiro / Galeão",
    city: "Rio de Janeiro",
    state: "RJ",
    country: "BR",
    latitude: -22.809999,
    longitude: -43.250556,
    runways: [{ ident: "10/28", lengthMeters: 4000, widthMeters: 45 }],
    ...overrides,
  };
}

function procedure(overrides: Partial<AirportProcedure> = {}): AirportProcedure {
  return {
    id: "12345",
    airportIcao: "SBGL",
    name: "IAC ILS RWY 10",
    type: "IAC",
    amendment: "3",
    sourceUrl: "https://aisweb.example/carta.pdf",
    storageKey: "SBGL/12345.pdf",
    archivedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toAirportSummaryResponse", () => {
  it("agrupa a localização em `location`, sem pistas (FR-007, FR-008)", () => {
    const { runways: _runways, ...summary } = airport();

    expect(toAirportSummaryResponse(summary)).toEqual({
      icao: "SBGL",
      name: "Rio de Janeiro / Galeão",
      location: {
        city: "Rio de Janeiro",
        state: "RJ",
        country: "BR",
        latitude: -22.809999,
        longitude: -43.250556,
      },
    });
  });

  it("não expõe cidade, UF nem coordenadas no nível superior (FR-009)", () => {
    const { runways: _runways, ...summary } = airport();

    const body = toAirportSummaryResponse(summary);

    expect(Object.keys(body)).toEqual(["icao", "name", "location"]);
  });

  it("expõe o país como código, sem tradução (FR-010)", () => {
    const { runways: _runways, ...summary } = airport({ country: "BR" });

    expect(toAirportSummaryResponse(summary).location.country).toBe("BR");
  });

  it("emite null explícito para campos ausentes, nunca os omite (FR-011)", () => {
    const { runways: _runways, ...summary } = airport({
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
    });

    const body = toAirportSummaryResponse(summary);

    expect(Object.keys(body.location)).toEqual([
      "city",
      "state",
      "country",
      "latitude",
      "longitude",
    ]);
    expect(body.location.city).toBeNull();
    expect(body.location.state).toBeNull();
    expect(body.location.country).toBeNull();
    expect(body.location.latitude).toBeNull();
    expect(body.location.longitude).toBeNull();
  });

  it("mantém `location` presente mesmo com todos os campos nulos (FR-012)", () => {
    const { runways: _runways, ...summary } = airport({
      city: null,
      state: null,
      country: null,
      latitude: null,
      longitude: null,
    });

    const body = toAirportSummaryResponse(summary);

    expect(Object.keys(body)).toContain("location");
    expect(body.location).not.toBeNull();
  });
});

describe("toAirportDetailResponse", () => {
  it("acrescenta as pistas ao resumo", () => {
    expect(toAirportDetailResponse(airport()).runways).toEqual([
      { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
    ]);
  });

  it("devolve array vazio para aeródromo sem pistas, não erro", () => {
    expect(toAirportDetailResponse(airport({ runways: [] })).runways).toEqual([]);
  });

  it("traz o mesmo `location` da listagem (FR-008)", () => {
    const { runways: _runways, ...summary } = airport();

    expect(toAirportDetailResponse(airport()).location).toEqual(
      toAirportSummaryResponse(summary).location,
    );
  });
});

describe("toProcedureResponse", () => {
  it("deriva hasChart de storageKey e archivedAt preenchidos", () => {
    expect(toProcedureResponse(procedure()).hasChart).toBe(true);
  });

  it("não expõe storageKey, sourceUrl nem archivedAt (FR-017)", () => {
    const body = toProcedureResponse(procedure());

    expect(Object.keys(body)).toEqual(["id", "name", "type", "amendment", "hasChart"]);
    // Asserção sobre o corpo serializado: é o que o consumidor de fato recebe.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("sourceUrl");
    expect(serialized).not.toContain("archivedAt");
    expect(serialized).not.toContain("SBGL/12345.pdf");
    expect(serialized).not.toContain("aisweb.example");
    expect(serialized).not.toContain("airportIcao");
  });

  it("preserva amendment nulo", () => {
    expect(toProcedureResponse(procedure({ amendment: null })).amendment).toBeNull();
  });
});

describe("hasChart", () => {
  it("exige as duas marcas: a chave sozinha não prova o objeto no bucket", () => {
    expect(hasChart(procedure())).toBe(true);
    expect(hasChart(procedure({ storageKey: null }))).toBe(false);
    expect(hasChart(procedure({ archivedAt: null }))).toBe(false);
    expect(hasChart(procedure({ storageKey: null, archivedAt: null }))).toBe(false);
  });
});

describe("toPageResponse", () => {
  it("deriva hasNext de page * pageSize < total (FR-004)", () => {
    expect(toPageResponse([1, 2], 1, 2, 5).hasNext).toBe(true);
    expect(toPageResponse([1], 3, 2, 5).hasNext).toBe(false);
    expect(toPageResponse([1, 2], 1, 2, 2).hasNext).toBe(false);
  });

  it("devolve página vazia sem erro, mantendo o total", () => {
    expect(toPageResponse([], 9, 20, 3)).toEqual({
      items: [],
      page: 9,
      pageSize: 20,
      total: 3,
      hasNext: false,
    });
  });

  it("devolve acervo vazio com total zero", () => {
    expect(toPageResponse([], 1, 20, 0)).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasNext: false,
    });
  });
});
