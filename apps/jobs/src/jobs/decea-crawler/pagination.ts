/**
 * Cálculo de páginas. Funções puras sem colaboradores — a exceção prevista no
 * plano para transformações sem dependências.
 */

/**
 * `Math.ceil` preserva a última página parcial. Truncar (o que o projeto Python
 * fazia) perderia os registros do resto da divisão — 4550/100 viraria 45
 * páginas e deixaria 50 aeródromos para trás (research R1).
 */
export function totalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) {
    throw new RangeError("o tamanho da página deve ser maior que zero");
  }
  if (total < 0) {
    throw new RangeError("o total de itens não pode ser negativo");
  }
  return Math.ceil(total / pageSize);
}

/** Deslocamento base 0 da página, como a fonte espera em `rowstart`. */
export function pageOffset(page: number, pageSize: number): number {
  if (page < 1) {
    throw new RangeError("o número da página começa em 1");
  }
  if (pageSize <= 0) {
    throw new RangeError("o tamanho da página deve ser maior que zero");
  }
  return (page - 1) * pageSize;
}
