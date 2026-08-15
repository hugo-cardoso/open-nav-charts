import { describe, expect, it } from "vitest";
import { pageOffset, totalPages } from "./pagination.js";

describe("totalPages", () => {
  it("preserva a última página parcial", () => {
    // 4550 / 100 = 45,5 — truncar perderia os últimos 50 aeródromos.
    expect(totalPages(4550, 100)).toBe(46);
  });

  it("não cria página extra quando o total é múltiplo exato", () => {
    expect(totalPages(400, 100)).toBe(4);
  });

  it("devolve uma página quando o total é menor que a página", () => {
    expect(totalPages(7, 100)).toBe(1);
  });

  it("devolve zero páginas para catálogo vazio", () => {
    expect(totalPages(0, 100)).toBe(0);
  });

  it("rejeita tamanho de página não positivo", () => {
    expect(() => totalPages(100, 0)).toThrow(RangeError);
    expect(() => totalPages(100, -1)).toThrow(RangeError);
  });

  it("rejeita total negativo", () => {
    expect(() => totalPages(-1, 100)).toThrow(RangeError);
  });
});

describe("pageOffset", () => {
  it("é base zero na primeira página", () => {
    expect(pageOffset(1, 100)).toBe(0);
  });

  it("avança de página em página", () => {
    expect(pageOffset(2, 100)).toBe(100);
    expect(pageOffset(46, 100)).toBe(4500);
  });

  it("rejeita número de página menor que um", () => {
    expect(() => pageOffset(0, 100)).toThrow(RangeError);
  });
});
