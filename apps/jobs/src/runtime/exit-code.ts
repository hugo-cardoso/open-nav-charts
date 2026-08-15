import { isAuthenticationSourceError } from "@open-nav-charts/aisweb-client";
import { InvalidConfigurationError } from "../config/environment-config.js";
import { UnknownJobError } from "./job-registry.js";
import type { RunReport } from "./run-report.js";

/**
 * Separar `1` de `2`/`3` importa: `1` é resultado com dado coletado, enquanto
 * `2` e `3` significam que nada foi feito e a causa é de ambiente (FR-028).
 */
export const ExitCode = {
  Success: 0,
  CompletedWithFailures: 1,
  InvalidConfiguration: 2,
  DependencyUnavailable: 3,
  Interrupted: 130,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export function exitCodeForReport(report: RunReport, interrupted: boolean): ExitCodeValue {
  if (interrupted) {
    return ExitCode.Interrupted;
  }
  return report.hasFailures ? ExitCode.CompletedWithFailures : ExitCode.Success;
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
  return ExitCode.CompletedWithFailures;
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
