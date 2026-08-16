import { describe, expect, it } from "vitest";
import { isValidIcao, normalizeIcao } from "./icao.js";

describe("normalizeIcao", () => {
  it("converte para maiúsculas", () => {
    expect(normalizeIcao("sbgl")).toBe("SBGL");
  });

  it("remove espaços ao redor", () => {
    expect(normalizeIcao("  SBGL  ")).toBe("SBGL");
  });

  /** Chaves de cache estáveis dependem disto. */
  it("produz o mesmo resultado para variações de caixa e espaço", () => {
    const formas = ["SBGL", "sbgl", " SbGl ", "sBgL"];
    expect(new Set(formas.map(normalizeIcao)).size).toBe(1);
  });
});

describe("isValidIcao", () => {
  it("aceita quatro letras em qualquer caixa", () => {
    for (const value of ["SBGL", "sbgl", "SbGl", " SBGL "]) {
      expect(isValidIcao(value), `deveria aceitar: ${value}`).toBe(true);
    }
  });

  it("recusa comprimento diferente de quatro", () => {
    for (const value of ["SBG", "SBGLX", "", "S"]) {
      expect(isValidIcao(value), `deveria recusar: ${value}`).toBe(false);
    }
  });

  it("recusa dígitos e símbolos", () => {
    for (const value of ["SB1L", "SB-L", "SB L"]) {
      expect(isValidIcao(value), `deveria recusar: ${value}`).toBe(false);
    }
  });

  it("recusa valor ausente", () => {
    expect(isValidIcao(undefined)).toBe(false);
  });
});
