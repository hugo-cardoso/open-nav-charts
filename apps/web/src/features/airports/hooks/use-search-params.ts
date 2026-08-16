import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

/**
 * Estado de consulta espelhado na query string (FR-003), o que torna a busca
 * recarregável e compartilhável, e faz o "voltar" do navegador percorrer os
 * passos reais da consulta (FR-004).
 */

export const DEFAULT_PAGE = 1;

export interface SearchQuery {
  readonly search: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly page: number;
}

export const EMPTY_QUERY: SearchQuery = {
  search: null,
  state: null,
  country: null,
  page: DEFAULT_PAGE,
};

const MAX_SEARCH_LENGTH = 100;
const TWO_LETTERS = /^[A-Za-z]{2}$/;

function sanitizeText(value: string | null): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") {
    return null;
  }
  // Corta em vez de recusar: um termo longo demais vira busca válida, e a
  // validação canônica continua sendo da API.
  return trimmed.slice(0, MAX_SEARCH_LENGTH);
}

/** Código malformado é tratado como ausente — a tela não quebra por URL editada à mão. */
function sanitizeCode(value: string | null): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "" || !TWO_LETTERS.test(trimmed)) {
    return null;
  }
  return trimmed.toUpperCase();
}

function sanitizePage(value: string | null): number {
  if (value === null) {
    return DEFAULT_PAGE;
  }
  if (!/^\d+$/.test(value.trim())) {
    return DEFAULT_PAGE;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_PAGE;
}

export function parseSearchQuery(params: URLSearchParams): SearchQuery {
  return {
    search: sanitizeText(params.get("search")),
    state: sanitizeCode(params.get("state")),
    country: sanitizeCode(params.get("country")),
    page: sanitizePage(params.get("page")),
  };
}

/**
 * Campos em valor padrão são omitidos da URL: o endereço de uma busca simples
 * fica curto e legível, e duas consultas equivalentes produzem a mesma URL.
 */
export function toSearchParams(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.search !== null) {
    params.set("search", query.search);
  }
  if (query.state !== null) {
    params.set("state", query.state);
  }
  if (query.country !== null) {
    params.set("country", query.country);
  }
  if (query.page !== DEFAULT_PAGE) {
    params.set("page", String(query.page));
  }

  return params;
}

export function isEmptyQuery(query: SearchQuery): boolean {
  return query.search === null && query.state === null && query.country === null;
}

export interface SearchQueryController {
  readonly query: SearchQuery;
  /**
   * Atualiza os critérios. Alterar termo, estado ou país redefine a página para
   * a primeira: manter a página anterior sob um filtro novo mostraria uma lista
   * vazia sem motivo aparente (data-model §2).
   */
  readonly setCriteria: (patch: Partial<Omit<SearchQuery, "page">>) => void;
  readonly setPage: (page: number) => void;
  readonly clearFilters: () => void;
}

export function useSearchQuery(): SearchQueryController {
  const [params, setParams] = useSearchParams();

  const query = useMemo(() => parseSearchQuery(params), [params]);

  /**
   * A atualização é sempre funcional, derivando do estado corrente da URL em vez
   * de um `query` capturado no render. Sem isso, teclas digitadas em rápida
   * sucessão leem todas o mesmo valor antigo e cada uma sobrescreve a anterior —
   * digitar "SBGL" acabava buscando só por "L".
   */
  const setCriteria = useCallback(
    (patch: Partial<Omit<SearchQuery, "page">>) => {
      setParams(
        (current) => {
          const next: SearchQuery = {
            ...parseSearchQuery(current),
            ...patch,
            // Trocar critério volta à primeira página: manter a anterior sob um
            // filtro novo mostraria uma lista vazia sem motivo aparente.
            page: DEFAULT_PAGE,
          };
          return toSearchParams(next);
        },
        // `replace` durante a digitação: sem isso, cada tecla viraria uma
        // entrada no histórico e o "voltar" percorreria letra a letra (FR-004).
        { replace: true },
      );
    },
    [setParams],
  );

  const setPage = useCallback(
    (page: number) => {
      // Mudança de página é navegação deliberada: entra no histórico.
      setParams((current) => toSearchParams({ ...parseSearchQuery(current), page }), {
        replace: false,
      });
    },
    [setParams],
  );

  const clearFilters = useCallback(() => {
    setParams(
      (current) => toSearchParams({ ...EMPTY_QUERY, search: parseSearchQuery(current).search }),
      { replace: false },
    );
  }, [setParams]);

  return { query, setCriteria, setPage, clearFilters };
}
