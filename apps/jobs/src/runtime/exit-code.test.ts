import { AuthenticationSourceError } from "@open-nav-charts/aisweb-client";
import { describe, expect, it } from "vitest";
import { InvalidConfigurationError } from "../config/environment-config.js";
import { ExitCode, exitCodeForError, exitCodeForReport } from "./exit-code.js";
import { UnknownJobError } from "./job-registry.js";
import { RunReport } from "./run-report.js";

describe("exitCodeForReport", () => {
  it("devolve 0 quando não houve falha definitiva", () => {
    const report = new RunReport(new Date());
    report.recordSuccess({
      icao: "SBGL",
      name: "Galeão",
      proceduresPersisted: 1,
      documentsArchived: 1,
      documentsAlreadyPresent: 0,
      documentsRemoved: 0,
    });

    expect(exitCodeForReport(report, false)).toBe(ExitCode.Success);
  });

  it("devolve 1 quando houve ao menos uma falha definitiva", () => {
    const report = new RunReport(new Date());
    report.recordFailure("SBXX", "timeout");

    expect(exitCodeForReport(report, false)).toBe(ExitCode.CompletedWithFailures);
  });

  it("devolve 130 quando a execução foi interrompida", () => {
    const report = new RunReport(new Date());

    expect(exitCodeForReport(report, true)).toBe(ExitCode.Interrupted);
  });

  it("prioriza a interrupção sobre a falha registrada", () => {
    const report = new RunReport(new Date());
    report.recordFailure("SBXX", "timeout");

    expect(exitCodeForReport(report, true)).toBe(ExitCode.Interrupted);
  });
});

describe("exitCodeForError", () => {
  it("devolve 2 para configuração inválida", () => {
    expect(exitCodeForError(new InvalidConfigurationError("faltou variável"))).toBe(
      ExitCode.InvalidConfiguration,
    );
  });

  it("devolve 2 para rotina inexistente", () => {
    // Erro de invocação, não da fonte: nada foi executado.
    expect(exitCodeForError(new UnknownJobError('rotina "x" não existe'))).toBe(
      ExitCode.InvalidConfiguration,
    );
  });

  it("devolve 3 para credencial da fonte rejeitada", () => {
    expect(exitCodeForError(new AuthenticationSourceError("401"))).toBe(
      ExitCode.DependencyUnavailable,
    );
  });

  it("devolve 130 para interrupção do operador", () => {
    const abortError = new DOMException("abortado", "AbortError");

    expect(exitCodeForError(abortError)).toBe(ExitCode.Interrupted);
  });

  it("devolve 3 para dependência indisponível", () => {
    expect(exitCodeForError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(
      ExitCode.DependencyUnavailable,
    );
  });

  it("devolve 1 para erro não classificado", () => {
    expect(exitCodeForError(new Error("bug"))).toBe(ExitCode.CompletedWithFailures);
  });
});
