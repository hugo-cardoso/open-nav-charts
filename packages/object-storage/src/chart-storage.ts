export interface ChartStorage {
  /** Chave determinística: `<ICAO>/<id>.pdf`. */
  buildKey(icao: string, procedureId: string): string;
  exists(key: string): Promise<boolean>;
  /** Rejeita conteúdo vazio ou que não comece com `%PDF-` (FR-019). */
  put(key: string, content: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Conteúdo baixado que não é um PDF utilizável — falha definitiva da carta. */
export class InvalidPdfContentError extends Error {
  override readonly name = "InvalidPdfContentError";
}
