/**
 * Código ICAO de aeródromo: quatro letras que identificam o local.
 *
 * Vive em `shared` e não na feature `airports` porque é vocabulário do domínio
 * aeronáutico, não de uma tela: tanto a busca de aeródromos quanto a listagem de
 * procedimentos e a rota da carta operam sobre ele. Deixá-lo dentro de
 * `airports` faria `procedures` depender daquela feature por duas funções puras
 * de string — acoplamento sem contrapartida.
 */

const ICAO_PATTERN = /^[A-Za-z]{4}$/;

/**
 * A API aceita qualquer caixa e normaliza sozinha, mas normalizar aqui mantém as
 * chaves de cache estáveis: `sbgl` e `SBGL` devem compartilhar a mesma entrada.
 */
export function normalizeIcao(icao: string): string {
  return icao.trim().toUpperCase();
}

/**
 * Um código fora do formato é tratado localmente, sem gastar uma requisição que
 * a API recusaria com `400 INVALID_ICAO`.
 */
export function isValidIcao(icao: string | undefined): icao is string {
  return icao !== undefined && ICAO_PATTERN.test(icao.trim());
}
