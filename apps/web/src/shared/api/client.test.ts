import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, buildUrl, requestJson, toFailure } from "../../shared/api/client.js";
import { errorBody } from "../../shared/testing/api-fixtures.js";

const BASE_URL = "http://api.test";

/**
 * Sem rede real em nenhum teste (Princípio IV).
 *
 * O teste de rejeição é explícito porque `DOMException` não herda de `Error`:
 * inferir o ramo por `instanceof Error` trataria um `AbortError` como resposta.
 */
function stubFetch(response: Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(response)),
  );
}

function stubFetchRejection(reason: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(reason)),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildUrl", () => {
  it("compõe caminho e parâmetros", () => {
    expect(buildUrl(BASE_URL, "/v1/airports", { search: "SBGL", page: 2 })).toBe(
      "http://api.test/v1/airports?search=SBGL&page=2",
    );
  });

  /**
   * Enviar `search=` vazio seria recusado com `400 INVALID_SEARCH`; por isso
   * valores nulos, indefinidos e vazios são omitidos, não serializados.
   */
  it("omite valores nulos, indefinidos e vazios", () => {
    expect(
      buildUrl(BASE_URL, "/v1/airports", {
        search: null,
        state: undefined,
        country: "",
        page: 1,
      }),
    ).toBe("http://api.test/v1/airports?page=1");
  });

  it("escapa caracteres especiais do termo de busca", () => {
    expect(buildUrl(BASE_URL, "/v1/airports", { search: "Rio de Janeiro / Galeão" })).toContain(
      "search=Rio+de+Janeiro+%2F+Gale%C3%A3o",
    );
  });
});

describe("requestJson", () => {
  it("devolve o corpo de uma resposta bem-sucedida", async () => {
    stubFetch(jsonResponse({ items: [], total: 0 }));

    await expect(requestJson({ baseUrl: BASE_URL, path: "/v1/airports" })).resolves.toEqual({
      items: [],
      total: 0,
    });
  });

  it("emite GET sem credenciais", async () => {
    stubFetch(jsonResponse({}));

    await requestJson({ baseUrl: BASE_URL, path: "/v1/airports" });

    expect(fetch).toHaveBeenCalledWith(
      "http://api.test/v1/airports",
      expect.objectContaining({ method: "GET", credentials: "omit" }),
    );
  });

  it("converte o envelope de erro da API em ApiFailure com o código correto", async () => {
    stubFetch(jsonResponse(errorBody("AIRPORT_NOT_FOUND"), 404));

    await expect(requestJson({ baseUrl: BASE_URL, path: "/v1/airports/SBXX" })).rejects.toThrow(
      ApiRequestError,
    );
  });

  it("preserva código e status da falha", async () => {
    stubFetch(jsonResponse(errorBody("INVALID_SEARCH"), 400));

    const error = await requestJson({ baseUrl: BASE_URL, path: "/v1/airports" }).catch(
      (caught: unknown) => caught,
    );

    expect(toFailure(error)).toEqual({
      code: "INVALID_SEARCH",
      status: 400,
      retryable: false,
    });
  });

  it("converte falha de rede em NETWORK_ERROR", async () => {
    stubFetchRejection(new TypeError("Failed to fetch"));

    const error = await requestJson({ baseUrl: BASE_URL, path: "/v1/airports" }).catch(
      (caught: unknown) => caught,
    );

    expect(toFailure(error)).toEqual({
      code: "NETWORK_ERROR",
      status: null,
      retryable: true,
    });
  });

  it("converte corpo de erro fora do envelope em UNEXPECTED_RESPONSE", async () => {
    stubFetch(new Response("<html>gateway</html>", { status: 502 }));

    const error = await requestJson({ baseUrl: BASE_URL, path: "/v1/airports" }).catch(
      (caught: unknown) => caught,
    );

    expect(toFailure(error).code).toBe("UNEXPECTED_RESPONSE");
  });

  it("converte corpo de sucesso não-JSON em UNEXPECTED_RESPONSE", async () => {
    stubFetch(new Response("not json", { status: 200 }));

    const error = await requestJson({ baseUrl: BASE_URL, path: "/v1/airports" }).catch(
      (caught: unknown) => caught,
    );

    expect(toFailure(error).code).toBe("UNEXPECTED_RESPONSE");
  });

  /** Cancelamento é descarte deliberado, não falha a ser exibida ao usuário. */
  it("repassa AbortError sem convertê-lo em falha de rede", async () => {
    stubFetchRejection(new DOMException("The operation was aborted.", "AbortError"));

    await expect(requestJson({ baseUrl: BASE_URL, path: "/v1/airports" })).rejects.toThrow(
      DOMException,
    );
  });

  it("converte código desconhecido da API em INTERNAL_ERROR", async () => {
    stubFetch(jsonResponse(errorBody("BRAND_NEW_CODE"), 500));

    const error = await requestJson({ baseUrl: BASE_URL, path: "/v1/airports" }).catch(
      (caught: unknown) => caught,
    );

    expect(toFailure(error).code).toBe("INTERNAL_ERROR");
  });
});
