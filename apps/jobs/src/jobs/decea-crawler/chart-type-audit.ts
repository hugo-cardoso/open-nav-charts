/**
 * As 13 siglas da espécie IFR conforme o DECEA. Lista de referência, não filtro:
 * a seleção IFR/VFR acontece no parâmetro `especie` da fonte, e nenhum campo da
 * resposta permite reclassificar localmente (research R2).
 */
const KNOWN_IFR_TYPES: ReadonlySet<string> = new Set([
  "ADC",
  "AOC",
  "ARC",
  "ATCSMAC",
  "GMC",
  "IAC",
  "LC",
  "OTR",
  "PATC",
  "PDC",
  "SID",
  "STAR",
  "VAC",
]);

/**
 * Instrumentação obrigatória do FR-012: acumula a distribuição de tipos e
 * sinaliza os desconhecidos. A carta é persistida normalmente — a fonte é a
 * autoridade; o alerta só avisa que a lista de referência envelheceu.
 */
export class ChartTypeAudit {
  // Prefixo `_` porque o getter público expõe o mesmo nome.
  private readonly _distribution = new Map<string, number>();
  private readonly unknown = new Set<string>();

  record(type: string): void {
    const normalized = type.toUpperCase();
    this._distribution.set(normalized, (this._distribution.get(normalized) ?? 0) + 1);
    if (!KNOWN_IFR_TYPES.has(normalized)) {
      this.unknown.add(normalized);
    }
  }

  /** Verdadeiro se o tipo está fora das 13 siglas conhecidas da espécie IFR. */
  isUnknown(type: string): boolean {
    return !KNOWN_IFR_TYPES.has(type.toUpperCase());
  }

  get unknownTypes(): readonly string[] {
    return [...this.unknown];
  }

  get distribution(): ReadonlyMap<string, number> {
    return new Map(this._distribution);
  }
}
