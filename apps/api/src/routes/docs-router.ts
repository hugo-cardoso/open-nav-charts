import { Router } from "express";
import { ERROR_CODES } from "../http/api-error.js";
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from "../http/create-app.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_SEARCH_LENGTH } from "../http/validation.js";
import { CHART_URL_TTL_SECONDS } from "../services/chart-service.js";

/**
 * Contrato publicado em JSON (FR-032). Suficiente para um desenvolvedor listar
 * aeródromos e abrir uma carta sem sair daqui (SC-006). Os limites são lidos das
 * mesmas constantes que a validação usa, para a documentação não descrever um
 * comportamento que o código não tem.
 */
const DOCUMENT = {
  name: "open-nav-charts REST API",
  description:
    "API somente leitura do acervo de aeródromos e cartas IFR coletado do DECEA. Nenhuma rota de escrita; nenhuma autenticação.",
  baseUrl: "/v1",
  contentType: "application/json; charset=utf-8",
  quickstart: [
    "1. Liste o catálogo: GET /v1/airports?pageSize=20",
    "2. Busque por nome, cidade ou ICAO, sem acento: GET /v1/airports?search=galeao",
    "3. Recorte por país e UF: GET /v1/airports?country=BR&state=RJ",
    "4. Abra a ficha do aeródromo: GET /v1/airports/SBGL",
    "5. Liste as cartas: GET /v1/airports/SBGL/procedures",
    "6. Abra a carta de um procedimento com hasChart=true: GET /v1/airports/SBGL/procedures/{id}/chart — responde 302 para o PDF.",
  ],
  endpoints: [
    {
      method: "GET",
      path: "/v1/airports",
      summary: "Catálogo paginado de aeródromos, ordenado por ICAO ascendente.",
      query: {
        page: `inteiro >= 1; padrão 1`,
        pageSize: `inteiro de 1 a ${MAX_PAGE_SIZE}; padrão ${DEFAULT_PAGE_SIZE}`,
        state: "2 letras, insensível a caixa",
        country:
          "código ISO 3166-1 alpha-2 (2 letras), insensível a caixa; combinável com state e search",
        search: `1 a ${MAX_SEARCH_LENGTH} caracteres; casa ICAO, nome ou cidade, insensível a caixa e a acentuação`,
      },
      response: {
        items: "lista de { icao, name, location } — aeródromos sem as pistas",
        page: "número",
        pageSize: "número",
        total: "total do conjunto filtrado",
        hasNext: "page * pageSize < total",
      },
      errors: ["INVALID_PAGINATION", "INVALID_STATE", "INVALID_COUNTRY", "INVALID_SEARCH"],
    },
    {
      method: "GET",
      path: "/v1/airports/:icao",
      summary: "Detalhe do aeródromo, com a relação de pistas.",
      params: { icao: "4 letras, insensível a caixa" },
      response: {
        icao: "string",
        name: "string",
        location:
          "objeto sempre presente com { city, state, country, latitude, longitude }; campo sem valor vem como null explícito. country é o código ISO 3166-1 alpha-2, sem tradução",
        runways: "lista de { ident, lengthMeters, widthMeters }",
      },
      errors: ["INVALID_ICAO", "AIRPORT_NOT_FOUND"],
    },
    {
      method: "GET",
      path: "/v1/airports/:icao/procedures",
      summary: "Relação de procedimentos do aeródromo. Não paginada.",
      params: { icao: "4 letras, insensível a caixa" },
      query: { type: "tipo da carta (IAC, SID, STAR, …), insensível a caixa" },
      response: {
        items: "lista de { id, name, type, amendment, hasChart }",
        total: "número de itens",
      },
      errors: ["INVALID_ICAO", "INVALID_PROCEDURE_TYPE", "AIRPORT_NOT_FOUND"],
    },
    {
      method: "GET",
      path: "/v1/airports/:icao/procedures/:id/chart",
      summary: `Redireciona (302) para o PDF da carta, em URL assinada válida por ${CHART_URL_TTL_SECONDS} segundos. Sem corpo; siga o Location.`,
      params: { icao: "4 letras, insensível a caixa", id: "identificador do procedimento" },
      headers: { Location: "URL assinada do bucket", "Cache-Control": "no-store" },
      errors: [
        "INVALID_ICAO",
        "INVALID_PROCEDURE_ID",
        "PROCEDURE_NOT_FOUND",
        "CHART_NOT_AVAILABLE",
        "CHART_STORAGE_UNAVAILABLE",
      ],
    },
    {
      method: "GET",
      path: "/health",
      summary:
        "Indicador de saúde, sem prefixo de versão e fora da limitação de taxa. 200 com status ok; 503 com status degraded quando o banco não responde.",
    },
    {
      method: "GET",
      path: "/docs",
      summary: "Este documento.",
    },
  ],
  errorFormat: {
    shape: { error: { code: "CÓDIGO_ESTÁVEL", message: "texto em português do Brasil" } },
    note: "Toda falha, em qualquer rota, responde neste envelope. Nenhuma resposta contém rastreamento de pilha, SQL ou nome de recurso de infraestrutura.",
    codes: ERROR_CODES,
  },
  rateLimit: {
    windowSeconds: RATE_LIMIT_WINDOW_MS / 1000,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    scope: "por endereço IP; /health é isento",
    onExceeded: "429 RATE_LIMITED com Retry-After em segundos",
  },
} as const;

export function createDocsRouter(): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.json(DOCUMENT);
  });

  return router;
}
