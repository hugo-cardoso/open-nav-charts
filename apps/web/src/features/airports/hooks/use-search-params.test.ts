import { describe, expect, it } from "vitest";
import {
  EMPTY_QUERY,
  isEmptyQuery,
  parseSearchQuery,
  type SearchQuery,
  toSearchParams,
} from "./use-search-params.js";

function parse(queryString: string): SearchQuery {
  return parseSearchQuery(new URLSearchParams(queryString));
}

describe("parseSearchQuery", () => {
  it("lê todos os critérios presentes", () => {
    expect(parse("search=SBGL&state=RJ&country=BR&page=3")).toEqual({
      search: "SBGL",
      state: "RJ",
      country: "BR",
      page: 3,
    });
  });

  it("usa os padrões quando a URL está vazia", () => {
    expect(parse("")).toEqual(EMPTY_QUERY);
  });

  it("normaliza estado e país para maiúsculas", () => {
    const query = parse("state=rj&country=br");
    expect(query.state).toBe("RJ");
    expect(query.country).toBe("BR");
  });

  /** URL editada à mão não pode quebrar a tela: valor inválido vira ausente. */
  it("trata código malformado como ausente", () => {
    expect(parse("state=RIO&country=B").state).toBeNull();
    expect(parse("state=RIO&country=B").country).toBeNull();
  });

  it("trata página malformada como a primeira", () => {
    for (const raw of ["page=zero", "page=-2", "page=0", "page=1.5", "page="]) {
      expect(parse(raw).page, `deveria cair no padrão: ${raw}`).toBe(1);
    }
  });

  it("ignora termo composto apenas de espaços", () => {
    expect(parse("search=%20%20").search).toBeNull();
  });

  it("corta o termo no limite aceito pela API", () => {
    expect(parse(`search=${"a".repeat(150)}`).search).toHaveLength(100);
  });
});

describe("toSearchParams", () => {
  it("omite campos em valor padrão", () => {
    expect(toSearchParams(EMPTY_QUERY).toString()).toBe("");
  });

  it("omite a primeira página", () => {
    expect(toSearchParams({ ...EMPTY_QUERY, search: "SBGL", page: 1 }).toString()).toBe(
      "search=SBGL",
    );
  });

  it("inclui a página quando não é a primeira", () => {
    expect(toSearchParams({ ...EMPTY_QUERY, page: 2 }).toString()).toBe("page=2");
  });

  /** Ida e volta preserva a consulta: é o que sustenta recarregar e compartilhar. */
  it("faz ida e volta sem perder informação", () => {
    const original: SearchQuery = {
      search: "Galeao",
      state: "RJ",
      country: "BR",
      page: 4,
    };

    expect(parseSearchQuery(toSearchParams(original))).toEqual(original);
  });
});

/**
 * Regressão de um defeito encontrado ao rodar a aplicação: digitar "SBGL"
 * rapidamente resultava em busca por "L". A causa era derivar cada atualização
 * de um `query` capturado no render, em vez do estado corrente da URL — as
 * quatro teclas liam todas o mesmo valor antigo e a última vencia.
 *
 * A correção usa a forma funcional de `setSearchParams`; estes testes travam a
 * propriedade que a torna correta: aplicar mudanças sucessivas a partir do
 * estado anterior acumula, em vez de sobrescrever.
 */
describe("acúmulo de mudanças sucessivas", () => {
  it("preserva cada caractere ao aplicar mudanças em sequência", () => {
    let params = new URLSearchParams();

    for (const value of ["S", "SB", "SBG", "SBGL"]) {
      params = toSearchParams({ ...parseSearchQuery(params), search: value, page: 1 });
    }

    expect(parseSearchQuery(params).search).toBe("SBGL");
  });

  it("mantém os filtros já aplicados ao mudar o termo", () => {
    const withFilters = toSearchParams({
      search: "SB",
      state: "RJ",
      country: "BR",
      page: 1,
    });

    const next = toSearchParams({
      ...parseSearchQuery(withFilters),
      search: "SBGL",
      page: 1,
    });

    expect(parseSearchQuery(next)).toEqual({
      search: "SBGL",
      state: "RJ",
      country: "BR",
      page: 1,
    });
  });

  it("volta à primeira página quando o termo muda", () => {
    const onPageThree = toSearchParams({ ...EMPTY_QUERY, search: "SB", page: 3 });

    const next = toSearchParams({
      ...parseSearchQuery(onPageThree),
      search: "SBGL",
      page: 1,
    });

    expect(parseSearchQuery(next).page).toBe(1);
  });
});

describe("isEmptyQuery", () => {
  it("reconhece a consulta sem critérios", () => {
    expect(isEmptyQuery(EMPTY_QUERY)).toBe(true);
  });

  it("não considera vazia uma consulta com filtro mas sem termo", () => {
    expect(isEmptyQuery({ ...EMPTY_QUERY, state: "RJ" })).toBe(false);
  });

  /** Só a página não constitui uma consulta: nada foi pedido ainda. */
  it("considera vazia uma consulta que só mudou de página", () => {
    expect(isEmptyQuery({ ...EMPTY_QUERY, page: 5 })).toBe(true);
  });
});
