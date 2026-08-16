/**
 * Catálogo de países para o seletor da busca.
 *
 * A lista é fixa no frontend: a API não expõe rota de países, e derivá-los do
 * acervo exigiria varrer a paginação inteira só para montar um `<select>`.
 *
 * Os códigos são ISO 3166-1 alpha-2, os mesmos que a API grava e aceita no
 * parâmetro `country`. Os nomes vêm de `Intl.DisplayNames`, do próprio
 * navegador — manter dezenas de rótulos à mão seria uma tabela a envelhecer
 * sozinha, e a plataforma já a tem.
 */

/**
 * Países cobertos. Hoje o acervo só contém `BR` (fonte DECEA), mas os vizinhos
 * ficam declarados para que ampliar a coleta não exija tocar neste arquivo —
 * apenas os que tiverem aeródromos devolvem resultado.
 */
export const COUNTRY_CODES = [
  "BR",
  "AR",
  "BO",
  "CL",
  "CO",
  "EC",
  "GY",
  "PE",
  "PY",
  "SR",
  "UY",
  "VE",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

export interface CountryOption {
  readonly code: string;
  readonly name: string;
}

/**
 * Nome do país em inglês, para casar com o idioma da interface (FR-024).
 *
 * `Intl.DisplayNames` existe em todo navegador atual; o recuo para o próprio
 * código cobre o caso de um ambiente sem a API — melhor exibir "BR" do que
 * quebrar a tela.
 */
export function countryName(code: string): string {
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return display.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** Opções ordenadas por nome, como o usuário as lê. */
export function countryOptions(): readonly CountryOption[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
}

/** Um código só é aceito se estiver no catálogo — o resto vira "sem filtro". */
export function isKnownCountry(code: string | null | undefined): code is CountryCode {
  if (code === null || code === undefined) {
    return false;
  }
  const upper = code.trim().toUpperCase();
  return (COUNTRY_CODES as readonly string[]).includes(upper);
}
