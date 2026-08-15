import { describe, expect, it } from "vitest";
import { InvalidPdfContentError } from "./chart-storage.js";
import { assertPdfContent, isPdfContent } from "./pdf-content.js";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("isPdfContent", () => {
  it("aceita conteúdo iniciado por %PDF-", () => {
    expect(isPdfContent(bytes("%PDF-1.7\n corpo do documento"))).toBe(true);
  });

  it("rejeita conteúdo vazio", () => {
    expect(isPdfContent(new Uint8Array())).toBe(false);
  });

  it("rejeita conteúdo menor que a assinatura", () => {
    expect(isPdfContent(bytes("%PDF"))).toBe(false);
  });

  it("rejeita página HTML devolvida com status 200", () => {
    expect(isPdfContent(bytes("<!DOCTYPE html><html><body>erro</body></html>"))).toBe(false);
  });

  it("rejeita PDF com lixo antes da assinatura", () => {
    expect(isPdfContent(bytes("   %PDF-1.7"))).toBe(false);
  });
});

describe("assertPdfContent", () => {
  it("passa em conteúdo válido", () => {
    expect(() => assertPdfContent(bytes("%PDF-1.4 x"), "SBGL/abc.pdf")).not.toThrow();
  });

  it("falha em conteúdo vazio identificando a chave", () => {
    expect(() => assertPdfContent(new Uint8Array(), "SBGL/abc.pdf")).toThrow(
      InvalidPdfContentError,
    );
    expect(() => assertPdfContent(new Uint8Array(), "SBGL/abc.pdf")).toThrow(/SBGL\/abc\.pdf/);
  });

  it("falha em conteúdo que não é PDF", () => {
    expect(() => assertPdfContent(bytes("<html>"), "SBGL/abc.pdf")).toThrow(InvalidPdfContentError);
  });
});
