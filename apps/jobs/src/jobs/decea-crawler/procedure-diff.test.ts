import type { AirportProcedure } from "@open-nav-charts/domain";
import { describe, expect, it } from "vitest";
import { diffProcedures } from "./procedure-diff.js";

function procedure(
  overrides: Partial<AirportProcedure> & Pick<AirportProcedure, "id">,
): AirportProcedure {
  return {
    airportIcao: "SBGL",
    name: `Carta ${overrides.id}`,
    type: "IAC",
    amendment: "2601A1",
    sourceUrl: null,
    storageKey: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("diffProcedures", () => {
  it("insere cartas novas quando não há nada persistido", () => {
    const incoming = [procedure({ id: "c1" }), procedure({ id: "c2" })];

    const diff = diffProcedures(incoming, []);

    expect(diff.toPersist.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(diff.toRemove).toEqual([]);
  });

  it("marca para remoção as cartas ausentes da fonte", () => {
    const diff = diffProcedures(
      [procedure({ id: "c1" })],
      [procedure({ id: "c1" }), procedure({ id: "antiga" })],
    );

    expect(diff.toRemove).toEqual(["antiga"]);
  });

  it("atualiza a emenda alterada sem duplicar a carta", () => {
    const diff = diffProcedures(
      [procedure({ id: "c1", amendment: "2602A1" })],
      [procedure({ id: "c1", amendment: "2601A1" })],
    );

    expect(diff.toPersist).toHaveLength(1);
    expect(diff.toPersist[0]?.amendment).toBe("2602A1");
    expect(diff.toRemove).toEqual([]);
  });

  it("preserva a chave de um documento já arquivado quando a nova vem nula", () => {
    const archivedAt = new Date("2026-08-01T10:00:00Z");

    const diff = diffProcedures(
      [procedure({ id: "c1", storageKey: null })],
      [procedure({ id: "c1", storageKey: "SBGL/c1.pdf", archivedAt })],
    );

    expect(diff.toPersist[0]?.storageKey).toBe("SBGL/c1.pdf");
    expect(diff.toPersist[0]?.archivedAt).toEqual(archivedAt);
  });

  it("sobrescreve a chave quando a coleta arquivou o documento de novo", () => {
    const diff = diffProcedures(
      [procedure({ id: "c1", storageKey: "SBGL/c1.pdf" })],
      [procedure({ id: "c1", storageKey: "SBGL/antigo.pdf" })],
    );

    expect(diff.toPersist[0]?.storageKey).toBe("SBGL/c1.pdf");
  });

  it("remove tudo quando a fonte deixa de publicar cartas do aeródromo", () => {
    const diff = diffProcedures([], [procedure({ id: "c1" }), procedure({ id: "c2" })]);

    expect(diff.toPersist).toEqual([]);
    expect(diff.toRemove).toEqual(["c1", "c2"]);
  });

  it("não remove nada quando fonte e banco coincidem", () => {
    const existing = [procedure({ id: "c1" }), procedure({ id: "c2" })];

    const diff = diffProcedures(existing, existing);

    expect(diff.toRemove).toEqual([]);
    expect(diff.toPersist).toHaveLength(2);
  });
});
