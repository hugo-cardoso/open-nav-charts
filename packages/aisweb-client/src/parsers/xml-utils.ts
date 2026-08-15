/**
 * Transformações puras sobre o resultado do fast-xml-parser. Sem colaboradores
 * e sem I/O — a exceção de "classe para tudo" prevista no plano.
 */

/** Um elemento repetível vem como objeto quando há um só, e como array quando há vários. */
export function toArray(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * Desembrulha o valor textual de um elemento, que pode vir como string simples,
 * número, ou objeto com `__cdata` / `#text` quando tem atributos ou CDATA.
 */
export function toNullableText(value: unknown): string | null {
  if (typeof value === "string") {
    return normalize(value);
  }
  if (typeof value === "number") {
    return normalize(String(value));
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const cdata = record.__cdata;
    if (cdata !== undefined) {
      return toNullableText(Array.isArray(cdata) ? cdata.join("") : cdata);
    }
    const text = record["#text"];
    if (text !== undefined) {
      return toNullableText(text);
    }
  }
  return null;
}

export function toNullableNumber(value: unknown): number | null {
  const text = toNullableText(value);
  if (text === null) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converte `22 48 36S` / `043 15 02W` em graus decimais com sinal. Só é usado
 * como fallback: o par decimal da fonte é o caminho principal (research R4).
 */
export function parseSexagesimal(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const match = /^(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s*([NSEWnsew])$/.exec(value.trim());
  if (match === null) {
    return null;
  }
  const [, degrees, minutes, seconds, hemisphere] = match;
  const decimal = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
  if (!Number.isFinite(decimal)) {
    return null;
  }
  const isNegative = hemisphere?.toUpperCase() === "S" || hemisphere?.toUpperCase() === "W";
  return isNegative ? -decimal : decimal;
}

/** O `link` das cartas vem com `&amp;` escapado dentro do CDATA. */
export function unescapeXmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function normalize(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
