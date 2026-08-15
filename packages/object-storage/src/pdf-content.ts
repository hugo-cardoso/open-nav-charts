import { InvalidPdfContentError } from "./chart-storage.js";

/**
 * Assinatura de arquivo PDF: `%PDF-`. Função pura sem I/O — a exceção de
 * "classe para tudo" prevista no plano.
 */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

/**
 * O `Content-Type` da fonte não é confiável (research R3): um HTTP 200 pode
 * devolver uma página de erro HTML. Sem esta checagem o bucket acumularia lixo
 * silenciosamente.
 */
export function isPdfContent(content: Uint8Array): boolean {
  if (content.length < PDF_SIGNATURE.length) {
    return false;
  }
  return PDF_SIGNATURE.every((byte, index) => content[index] === byte);
}

export function assertPdfContent(content: Uint8Array, key: string): void {
  if (content.length === 0) {
    throw new InvalidPdfContentError(`conteúdo vazio para ${key}`);
  }
  if (!isPdfContent(content)) {
    throw new InvalidPdfContentError(`conteúdo baixado para ${key} não é um PDF`);
  }
}
