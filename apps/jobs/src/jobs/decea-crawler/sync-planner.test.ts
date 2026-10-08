import type { AirportCatalogEntry, ChartSummary } from "@open-nav-charts/aisweb-client";
import type { AirportSnapshot } from "@open-nav-charts/domain";
import { describe, expect, it } from "vitest";
import { catalogEntry, chart } from "../../testing/doubles.js";
import { toAirport, toProcedure } from "./airport-comparison.js";
import { type PlanOptions, planSync, type SyncPlanInput } from "./sync-planner.js";

const NOW = new Date("2026-10-08T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const observedAt = new Date("2026-10-01T03:00:00Z");

function key(icao: string, id: string): string {
  return `${icao}/${id}.pdf`;
}

/** Retrato de um aeródromo já coletado e em dia com a fonte. */
function upToDate(
  entry: AirportCatalogEntry,
  charts: readonly ChartSummary[] = [],
  overrides: Partial<AirportSnapshot> = {},
): AirportSnapshot {
  return {
    airport: toAirport(entry, [{ ident: "10/28", lengthMeters: 1500, widthMeters: 30 }]),
    procedures: charts.map((item) => toProcedure(item, key(entry.icao, item.id), observedAt)),
    runwaysCheckedAt: new Date(NOW.getTime() - DAY),
    sourceUpdatedOn: entry.updatedOn,
    ...overrides,
  };
}

const defaults: PlanOptions = {
  force: false,
  only: [],
  revalidationDays: 7,
  revalidationBudget: 1000,
  skipDocuments: false,
};

function plan(input: Partial<SyncPlanInput> & Pick<SyncPlanInput, "catalog">) {
  return planSync({
    charts: [],
    snapshots: new Map(),
    archivedKeys: new Set(),
    buildKey: key,
    observedAt,
    now: NOW,
    options: defaults,
    ...input,
  });
}

function only(result: ReturnType<typeof planSync>, icao: string) {
  const found = result.airports.find((item) => item.entry.icao === icao);
  if (found === undefined) {
    throw new Error(`${icao} fora do plano`);
  }
  return found;
}

describe("planSync — destino do aeródromo", () => {
  const sbgl = catalogEntry({ icao: "SBGL" });
  const c1 = chart({ id: "c1", airportIcao: "SBGL" });

  it("deixa inalterado o aeródromo em dia com a fonte", () => {
    const result = plan({
      catalog: [sbgl],
      charts: [c1],
      snapshots: new Map([["SBGL", upToDate(sbgl, [c1])]]),
      archivedKeys: new Set([key("SBGL", "c1")]),
    });

    expect(only(result, "SBGL")).toMatchObject({ runwaysReason: null, writeReasons: [] });
  });

  it("revalida as pistas do aeródromo que nunca foi coletado", () => {
    const result = plan({ catalog: [sbgl] });

    expect(only(result, "SBGL").runwaysReason).toBe("new");
  });

  it("grava quando o cadastro muda", () => {
    const result = plan({
      catalog: [{ ...sbgl, name: "Novo nome" }],
      snapshots: new Map([["SBGL", upToDate(sbgl)]]),
    });

    expect(only(result, "SBGL")).toMatchObject({ runwaysReason: null, writeReasons: ["cadastro"] });
  });

  it("grava quando uma carta é incluída, alterada ou retirada", () => {
    const snapshots = new Map([["SBGL", upToDate(sbgl, [c1])]]);
    const archivedKeys = new Set([key("SBGL", "c1"), key("SBGL", "c2")]);
    const c2 = chart({ id: "c2", airportIcao: "SBGL" });

    for (const charts of [[c1, c2], [{ ...c1, amendment: "2610A1" }], []]) {
      const result = plan({ catalog: [sbgl], charts, snapshots, archivedKeys });
      expect(only(result, "SBGL").writeReasons).toEqual(["cartas"]);
    }
  });

  it("grava quando o documento de uma carta sumiu do bucket", () => {
    const result = plan({
      catalog: [sbgl],
      charts: [c1],
      snapshots: new Map([["SBGL", upToDate(sbgl, [c1])]]),
      archivedKeys: new Set(),
    });

    expect(only(result, "SBGL").writeReasons).toEqual(["documentos"]);
  });

  it("com --skip-documents, documento ausente não força gravação", () => {
    const withoutDocument = upToDate(sbgl, [c1], {
      procedures: [toProcedure(c1, null, null)],
    });

    const result = plan({
      catalog: [sbgl],
      charts: [c1],
      snapshots: new Map([["SBGL", withoutDocument]]),
      archivedKeys: null,
      options: { ...defaults, skipDocuments: true },
    });

    expect(only(result, "SBGL")).toMatchObject({ runwaysReason: null, writeReasons: [] });
  });

  it("separa as cartas de aeródromos fora do catálogo", () => {
    const outside = chart({ id: "x1", airportIcao: "SBEN" });

    const result = plan({ catalog: [sbgl], charts: [c1, outside] });

    expect(result.chartsOutsideCatalog).toEqual([outside]);
    expect(only(result, "SBGL").charts).toEqual([c1]);
  });
});

describe("planSync — pistas pendentes", () => {
  const sbgl = catalogEntry({ icao: "SBGL", updatedOn: "2026-09-10" });

  function reasonFor(snapshot: AirportSnapshot, input: Partial<SyncPlanInput> = {}) {
    return only(
      plan({ catalog: [sbgl], snapshots: new Map([["SBGL", snapshot]]), ...input }),
      "SBGL",
    ).runwaysReason;
  }

  it("revalida quando a última coleta das pistas não registrou sucesso", () => {
    expect(reasonFor(upToDate(sbgl, [], { runwaysCheckedAt: null }))).toBe("pending");
  });

  it("revalida quando o registro ROTAER mudou na fonte", () => {
    expect(reasonFor(upToDate(sbgl, [], { sourceUpdatedOn: "2026-01-01" }))).toBe("source-updated");
  });

  it("não usa a data do registro quando a fonte não a publica", () => {
    const result = plan({
      catalog: [{ ...sbgl, updatedOn: null }],
      snapshots: new Map([["SBGL", upToDate(sbgl)]]),
    });

    expect(only(result, "SBGL").runwaysReason).not.toBe("source-updated");
  });

  it("revalida quando o conjunto IFR mudou depois da última coleta das pistas", () => {
    const before = new Date(observedAt.getTime() - DAY);

    expect(reasonFor(upToDate(sbgl, [], { runwaysCheckedAt: before }))).toBe("airac");
  });

  it("revalida quando a última coleta das pistas passou de revalidationDays", () => {
    const old = new Date(NOW.getTime() - 8 * DAY);

    expect(reasonFor(upToDate(sbgl, [], { runwaysCheckedAt: old }), { observedAt: null })).toBe(
      "age",
    );
  });

  it("revalida os ICAOs de --only e todos em --force", () => {
    const snapshot = upToDate(sbgl);

    expect(reasonFor(snapshot, { options: { ...defaults, only: ["SBGL"] } })).toBe("requested");
    expect(reasonFor(snapshot, { options: { ...defaults, force: true } })).toBe("requested");
  });

  it("restringe o plano aos ICAOs de --only", () => {
    const sbsp = catalogEntry({ icao: "SBSP" });

    const result = plan({
      catalog: [sbgl, sbsp],
      options: { ...defaults, only: ["SBSP"] },
    });

    expect(result.airports.map((item) => item.entry.icao)).toEqual(["SBSP"]);
  });

  it("limita ao orçamento só os vencidos por idade, escolhendo os mais antigos", () => {
    const entries = ["SBAA", "SBBB", "SBCC", "SBDD"].map((icao) =>
      catalogEntry({ icao, updatedOn: "2026-01-01" }),
    );
    const ages = [10, 30, 20, 9];
    const snapshots = new Map(
      entries.map((entry, index) => [
        entry.icao,
        upToDate(entry, [], {
          runwaysCheckedAt: new Date(NOW.getTime() - (ages[index] ?? 0) * DAY),
        }),
      ]),
    );
    const fresh = catalogEntry({ icao: "SBNW" });

    const result = plan({
      catalog: [...entries, fresh],
      snapshots,
      observedAt: null,
      options: { ...defaults, revalidationBudget: 2 },
    });

    const reasons = Object.fromEntries(
      result.airports.map((item) => [item.entry.icao, item.runwaysReason]),
    );
    // SBBB (30 dias) e SBCC (20 dias) cabem no orçamento; SBNW é novo e não conta.
    expect(reasons).toEqual({ SBAA: null, SBBB: "age", SBCC: "age", SBDD: null, SBNW: "new" });
    expect(result.agedOutDeferred).toBe(2);
  });
});
