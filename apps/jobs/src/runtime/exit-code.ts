import { isAuthenticationSourceError } from "@open-nav-charts/aisweb-client";
import { InvalidConfigurationError } from "../config/environment-config.js";
import { UnknownJobError } from "./job-registry.js";
import type { RunReport } from "./run-report.js";

/**
 * `0` significa que a rotina rodou e persistiu dado — com ou sem falhas de itens
 * individuais, que vivem no resumo, não aqui. `1`/`2`/`3` significam que o
 * trabalho não foi feito: `1` é erro inesperado não tratado, `2`/`3` são falhas
 * de ambiente. Um agendador binário lê `0` como sucesso e qualquer outro código
 * como falha, então só o desfecho "não rodou" deve sair não-zero.
 */
export const ExitCode = {
  Success: 0,
  UnexpectedError: 1,
  InvalidConfiguration: 2,
  DependencyUnavailable: 3,
  Interrupted: 130,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

// `_report` é intencionalmente ignorado: uma execução que produziu relatório
// rodou e persistiu dado, então o código é sempre `Success` fora de interrupção.
// O parâmetro permanece para distinguir, no ponto de chamada, o caminho de
// relatório do caminho de exceção (`exitCodeForError`); as falhas de itens vivem
// no resumo, não no código de saída (FR-001, FR-004).
export function exitCodeForReport(_report: RunReport, interrupted: boolean): ExitCodeValue {
  if (interrupted) {
    return ExitCode.Interrupted;
  }
  return ExitCode.Success;
}

export function exitCodeForError(error: unknown): ExitCodeValue {
  // Rotina inexistente é erro de invocação, da mesma família de configuração
  // inválida: nada foi executado e a causa está em quem chamou.
  if (error instanceof InvalidConfigurationError || error instanceof UnknownJobError) {
    return ExitCode.InvalidConfiguration;
  }
  if (isAborted(error)) {
    return ExitCode.Interrupted;
  }
  if (isAuthenticationSourceError(error) || isUnavailableDependency(error)) {
    return ExitCode.DependencyUnavailable;
  }
  // Erro não classificado: um caminho não previsto (bug). Continua não-zero,
  // logo falha para o agendador, mas distinto das falhas de ambiente.
  return ExitCode.UnexpectedError;
}

function isAborted(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Banco ou bucket fora do ar impedem a execução tanto quanto credencial ruim. */
function isUnavailableDependency(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"].includes(code)) {
    return true;
  }
  return /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/.test(error.message);
}
