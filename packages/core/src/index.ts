/**
 * Superfície pública de `@open-nav-charts/core`.
 *
 * Este pacote é a referência estrutural para bibliotecas do workspace. O conteúdo
 * abaixo existe apenas para provar que a infraestrutura funciona ponta a ponta;
 * a lógica de domínio de cartas náuticas entra em features posteriores.
 */

/** Ponto geográfico em graus decimais. */
export interface Coordinate {
  /** Latitude em graus decimais, de -90 a 90. */
  readonly latitude: number;
  /** Longitude em graus decimais, de -180 a 180. */
  readonly longitude: number;
}

/**
 * Formata uma coordenada em graus decimais com hemisférios explícitos.
 *
 * @throws {RangeError} Se a latitude ou a longitude estiver fora do intervalo válido.
 */
export function formatCoordinate(coordinate: Coordinate, fractionDigits = 4): string {
  const { latitude, longitude } = coordinate;

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError(`Latitude fora do intervalo [-90, 90]: ${latitude}`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError(`Longitude fora do intervalo [-180, 180]: ${longitude}`);
  }

  const lat = `${Math.abs(latitude).toFixed(fractionDigits)}° ${latitude < 0 ? "S" : "N"}`;
  const lon = `${Math.abs(longitude).toFixed(fractionDigits)}° ${longitude < 0 ? "W" : "E"}`;

  return `${lat}, ${lon}`;
}
