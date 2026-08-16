import { describe, expect, it } from "vitest";
import type { Procedure } from "../../../shared/api/types.js";
import { GROUP_COLORS, groupOf, groupProcedures, PROCEDURE_GROUP_IDS } from "./procedure-groups.js";

function procedure(type: string, id = type): Procedure {
  return { id, name: `${type} procedure`, type, amendment: null, hasChart: true };
}

describe("groupOf", () => {
  it("mapeia cada tipo ao seu grupo", () => {
    expect(groupOf("STAR")).toBe("STAR");
    expect(groupOf("SID")).toBe("SID");
    expect(groupOf("IAC")).toBe("IAC");
    expect(groupOf("VAC")).toBe("IAC");
    expect(groupOf("ADC")).toBe("TAXI");
    expect(groupOf("PDC")).toBe("TAXI");
  });

  /** A fonte fala em "GMC", mas o acervo grava "AGMC" — é esse que chega da API. */
  it("reconhece AGMC como o GMC do agrupamento", () => {
    expect(groupOf("AGMC")).toBe("TAXI");
  });

  it("normaliza caixa e espaços", () => {
    expect(groupOf(" star ")).toBe("STAR");
    expect(groupOf("vac")).toBe("IAC");
  });

  /**
   * `AOC` existe em praticamente todo aeródromo do acervo mas não consta do
   * agrupamento. Sem este recuo, seus procedimentos ficariam inalcançáveis.
   */
  it("recolhe tipos fora do agrupamento em OTHER", () => {
    expect(groupOf("AOC")).toBe("OTHER");
    expect(groupOf("ALGO_NOVO")).toBe("OTHER");
  });
});

describe("groupProcedures", () => {
  it("distribui os procedimentos nas abas correspondentes", () => {
    const groups = groupProcedures([
      procedure("STAR"),
      procedure("IAC"),
      procedure("VAC"),
      procedure("ADC"),
    ]);

    expect(groups.find((g) => g.id === "IAC")?.procedures).toHaveLength(2);
    expect(groups.find((g) => g.id === "TAXI")?.procedures).toHaveLength(1);
  });

  /** A posição de cada aba precisa ser estável entre aeródromos. */
  it("mantém a ordem canônica das abas, não a de chegada dos dados", () => {
    const groups = groupProcedures([procedure("SID"), procedure("ADC"), procedure("STAR")]);

    expect(groups.map((g) => g.id)).toEqual(["STAR", "IAC", "TAXI", "SID"]);
  });

  /**
   * As abas do agrupamento existem sempre: a posição de cada uma fica idêntica
   * em todo aeródromo, e a ausência de um tipo vira informação visível.
   */
  it("mantém as abas do agrupamento mesmo sem procedimentos", () => {
    const groups = groupProcedures([procedure("STAR")]);

    expect(groups.map((g) => g.id)).toEqual(["STAR", "IAC", "TAXI", "SID"]);
    expect(groups.find((g) => g.id === "SID")?.procedures).toEqual([]);
  });

  it("preserva a ordem da API dentro de cada grupo", () => {
    const groups = groupProcedures([
      procedure("IAC", "primeiro"),
      procedure("STAR"),
      procedure("VAC", "segundo"),
      procedure("IAC", "terceiro"),
    ]);

    expect(groups.find((g) => g.id === "IAC")?.procedures.map((p) => p.id)).toEqual([
      "primeiro",
      "segundo",
      "terceiro",
    ]);
  });

  it("agrupa tipos desconhecidos em OTHER, ao final", () => {
    const groups = groupProcedures([procedure("AOC"), procedure("STAR")]);

    expect(groups.map((g) => g.id)).toEqual(["STAR", "IAC", "TAXI", "SID", "OTHER"]);
    expect(groups.find((g) => g.id === "OTHER")?.procedures).toHaveLength(1);
  });

  /**
   * `OTHER` é a exceção à regra de exibir sempre: ela recolhe tipos imprevistos,
   * então mostrá-la vazia anunciaria uma categoria sem significado para quem lê.
   */
  it("omite OTHER quando não há tipo fora do agrupamento", () => {
    const groups = groupProcedures([procedure("STAR")]);

    expect(groups.map((g) => g.id)).not.toContain("OTHER");
  });

  it("devolve as abas do agrupamento, todas vazias, sem procedimento algum", () => {
    const groups = groupProcedures([]);

    expect(groups.map((g) => g.id)).toEqual(["STAR", "IAC", "TAXI", "SID"]);
    expect(groups.every((g) => g.procedures.length === 0)).toBe(true);
  });

  it("não perde nenhum procedimento no agrupamento", () => {
    const input = ["STAR", "IAC", "VAC", "ADC", "AGMC", "PDC", "SID", "AOC"].map((t) =>
      procedure(t),
    );

    const total = groupProcedures(input).reduce((sum, g) => sum + g.procedures.length, 0);

    expect(total).toBe(input.length);
  });
});

describe("cores das abas", () => {
  it("define uma cor para cada grupo", () => {
    for (const id of PROCEDURE_GROUP_IDS) {
      expect(GROUP_COLORS[id], `grupo sem cor: ${id}`).toBeTruthy();
    }
  });

  /** Cores repetidas anulariam a diferenciação visual entre abas. */
  it("usa cores distintas entre os grupos", () => {
    const cores = PROCEDURE_GROUP_IDS.map((id) => GROUP_COLORS[id]);
    expect(new Set(cores).size).toBe(cores.length);
  });
});
