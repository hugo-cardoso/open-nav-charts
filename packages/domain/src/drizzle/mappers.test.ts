import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "./mappers.js";

describe("normalizeSearchText", () => {
  it("remove os acentos do português", () => {
    expect(normalizeSearchText("São Paulo")).toBe("sao paulo");
    expect(normalizeSearchText("Galeão")).toBe("galeao");
    expect(normalizeSearchText("Antônio")).toBe("antonio");
    expect(normalizeSearchText("Açu")).toBe("acu");
    expect(normalizeSearchText("Vitória")).toBe("vitoria");
  });

  it("cobre todos os diacríticos usados em português", () => {
    expect(normalizeSearchText("áàâãäéèêëíìîïóòôõöúùûüçñ")).toBe("aaaaaeeeeiiiiooooouuuucn");
  });

  it("reduz a caixa mista a minúsculas", () => {
    expect(normalizeSearchText("SBGL Rio De Janeiro")).toBe("sbgl rio de janeiro");
  });

  it("é idempotente: normalizar texto já normalizado não o altera", () => {
    const once = normalizeSearchText("SBGL Galeão Rio de Janeiro");

    expect(normalizeSearchText(once)).toBe(once);
  });

  it("preserva separadores, dígitos e texto sem acento", () => {
    expect(normalizeSearchText("SBSP / Congonhas 2")).toBe("sbsp / congonhas 2");
  });

  it("devolve string vazia para entrada vazia", () => {
    expect(normalizeSearchText("")).toBe("");
  });
});
