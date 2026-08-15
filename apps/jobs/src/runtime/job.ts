import type { RunReport } from "./run-report.js";

/**
 * Contrato de uma rotina — o ponto de extensão do host. Adicionar uma rotina é
 * registrar uma implementação, sem tocar nas existentes (FR-003).
 */
export interface Job {
  /** Nome do subcomando. Único no registro. */
  readonly name: string;
  /** Descrição exibida no --help. */
  readonly description: string;
  /** Executa a rotina e devolve o relatório do que foi feito. */
  run(signal: AbortSignal): Promise<RunReport>;
}
