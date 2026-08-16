import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryName, countryOptions, isKnownCountry } from "./countries.js";

describe("countryName", () => {
  it("traduz o código para o nome em inglês", () => {
    expect(countryName("BR")).toBe("Brazil");
    expect(countryName("AR")).toBe("Argentina");
  });

  it("aceita o código em qualquer caixa", () => {
    expect(countryName("br")).toBe("Brazil");
  });

  /**
   * `Intl.DisplayNames` resolve códigos não atribuídos como "Unknown Region" em
   * vez de devolver vazio, então o recuo para o próprio código só entra em
   * ambiente sem a API. O que importa aqui é não quebrar nem devolver vazio.
   */
  it("devolve algo legível para código não atribuído", () => {
    const nome = countryName("ZZ");
    expect(nome).not.toBe("");
    expect(typeof nome).toBe("string");
  });
});

describe("countryOptions", () => {
  it("inclui todos os códigos do catálogo", () => {
    expect(countryOptions()).toHaveLength(COUNTRY_CODES.length);
  });

  it("ordena por nome, como o usuário lê", () => {
    const nomes = countryOptions().map((o) => o.name);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("traz o Brasil, o único país com aeródromos no acervo", () => {
    expect(countryOptions().find((o) => o.code === "BR")?.name).toBe("Brazil");
  });

  it("usa códigos ISO alpha-2, o formato que a API aceita", () => {
    for (const option of countryOptions()) {
      expect(option.code, `código fora do formato: ${option.code}`).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe("isKnownCountry", () => {
  it("reconhece os códigos do catálogo", () => {
    expect(isKnownCountry("BR")).toBe(true);
    expect(isKnownCountry("br")).toBe(true);
  });

  /** Um código fora do catálogo é tratado como ausência de filtro. */
  it("recusa código desconhecido", () => {
    expect(isKnownCountry("ZZ")).toBe(false);
    expect(isKnownCountry("BRA")).toBe(false);
  });

  it("recusa valor ausente", () => {
    expect(isKnownCountry(null)).toBe(false);
    expect(isKnownCountry(undefined)).toBe(false);
    expect(isKnownCountry("")).toBe(false);
  });
});
