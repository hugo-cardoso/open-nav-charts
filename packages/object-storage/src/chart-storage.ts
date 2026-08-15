export interface ChartStorage {
  /** Chave determinística: `<ICAO>/<id>.pdf`. */
  buildKey(icao: string, procedureId: string): string;
  exists(key: string): Promise<boolean>;
  /** Rejeita conteúdo vazio ou que não comece com `%PDF-` (FR-019). */
  put(key: string, content: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * URL de leitura assinada e temporária. A assinatura é local — nenhuma ida à
   * rede, e nenhum byte do objeto atravessa quem chama.
   */
  presignGetUrl(key: string, expiresInSeconds: number): Promise<string>;
}

/** Conteúdo baixado que não é um PDF utilizável — falha definitiva da carta. */
export class InvalidPdfContentError extends Error {
  override readonly name = "InvalidPdfContentError";
}
