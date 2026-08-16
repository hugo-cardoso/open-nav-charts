import { describe, expect, it } from "vitest";
import {
  API_ERROR_CODES,
  CLIENT_ERROR_CODES,
  describeError,
  errorMessage,
  isKnownErrorCode,
  isRetryable,
  toApiFailure,
} from "../../shared/errors/error-messages.js";

const ALL_CODES = [...API_ERROR_CODES, ...CLIENT_ERROR_CODES];

describe("mapa de mensagens de erro", () => {
  it("cobre todo código conhecido com texto não vazio", () => {
    for (const code of ALL_CODES) {
      expect(errorMessage(code), `código sem texto: ${code}`).not.toBe("");
    }
  });

  /**
   * A interface é em inglês (FR-024) e a API responde em português. Este teste é
   * a rede que impede uma mensagem da API de vazar para a tela: qualquer
   * diacrítico latino aqui denuncia texto em pt-BR.
   */
  it("não usa caracteres acentuados de português em nenhuma mensagem", () => {
    for (const code of ALL_CODES) {
      expect(errorMessage(code), `mensagem possivelmente em pt-BR: ${code}`).not.toMatch(/[À-ÿ]/u);
    }
  });

  it("recai em INTERNAL_ERROR para código desconhecido", () => {
    expect(errorMessage("SOMETHING_NEW_FROM_THE_API")).toBe(errorMessage("INTERNAL_ERROR"));
    expect(describeError("SOMETHING_NEW_FROM_THE_API").retryable).toBe(true);
  });

  it("reconhece apenas códigos da lista fechada", () => {
    expect(isKnownErrorCode("AIRPORT_NOT_FOUND")).toBe(true);
    expect(isKnownErrorCode("NETWORK_ERROR")).toBe(true);
    expect(isKnownErrorCode("NOPE")).toBe(false);
  });
});

describe("classificação de repetibilidade", () => {
  it("marca falhas transitórias como repetíveis", () => {
    for (const code of [
      "RATE_LIMITED",
      "SERVICE_UNAVAILABLE",
      "INTERNAL_ERROR",
      "CHART_STORAGE_UNAVAILABLE",
      "NETWORK_ERROR",
      "UNEXPECTED_RESPONSE",
    ]) {
      expect(isRetryable(code), `deveria ser repetível: ${code}`).toBe(true);
    }
  });

  /** Repetir uma validação recusada produz o mesmo resultado; oferecer "tentar de novo" enganaria. */
  it("não marca erros de validação nem de recurso inexistente como repetíveis", () => {
    for (const code of [
      "INVALID_ICAO",
      "INVALID_SEARCH",
      "INVALID_STATE",
      "INVALID_COUNTRY",
      "INVALID_PAGINATION",
      "AIRPORT_NOT_FOUND",
      "PROCEDURE_NOT_FOUND",
      "CHART_NOT_AVAILABLE",
    ]) {
      expect(isRetryable(code), `não deveria ser repetível: ${code}`).toBe(false);
    }
  });
});

describe("toApiFailure", () => {
  it("preserva código e status conhecidos", () => {
    expect(toApiFailure("AIRPORT_NOT_FOUND", 404)).toEqual({
      code: "AIRPORT_NOT_FOUND",
      status: 404,
      retryable: false,
    });
  });

  it("converte código desconhecido em INTERNAL_ERROR", () => {
    expect(toApiFailure("MYSTERY", 500)).toEqual({
      code: "INTERNAL_ERROR",
      status: 500,
      retryable: true,
    });
  });

  it("aceita status nulo quando a requisição não completou", () => {
    expect(toApiFailure("NETWORK_ERROR", null).status).toBeNull();
  });
});
