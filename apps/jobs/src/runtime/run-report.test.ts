import { describe, expect, it } from "vitest";
import { RunReport } from "./run-report.js";

function report(): RunReport {
  return new RunReport(new Date("2026-08-15T10:00:00Z"));
}

describe("RunReport", () => {
  describe("acumulação", () => {
    it("começa zerado", () => {
      const totals = report().totals;

      expect(totals).toEqual({
        airportsProcessed: 0,
        airportsSucceeded: 0,
        airportsFailed: 0,
        proceduresPersisted: 0,
        documentsArchived: 0,
        documentsAlreadyPresent: 0,
        documentsRemoved: 0,
      });
    });

    it("acumula sucessos com cartas e documentos", () => {
      const run = report();

      run.recordSuccess({
        icao: "SBGR",
        name: "Guarulhos",
        proceduresPersisted: 12,
        documentsArchived: 3,
        documentsAlreadyPresent: 9,
        documentsRemoved: 1,
      });
      run.recordSuccess({
        icao: "SBSP",
        name: "Congonhas",
        proceduresPersisted: 8,
        documentsArchived: 8,
        documentsAlreadyPresent: 0,
        documentsRemoved: 0,
      });

      expect(run.totals).toEqual({
        airportsProcessed: 2,
        airportsSucceeded: 2,
        airportsFailed: 0,
        proceduresPersisted: 20,
        documentsArchived: 11,
        documentsAlreadyPresent: 9,
        documentsRemoved: 1,
      });
    });

    it("acumula falhas de forma identificável", () => {
      const run = report();

      run.recordFailure("SBXX", "timeout ao detalhar aeródromo, após 3 tentativas");

      expect(run.totals.airportsProcessed).toBe(1);
      expect(run.totals.airportsFailed).toBe(1);
      expect(run.failures).toEqual([
        { icao: "SBXX", reason: "timeout ao detalhar aeródromo, após 3 tentativas" },
      ]);
    });

    it("acumula alertas sem contá-los como falha", () => {
      const run = report();

      run.recordWarning('SBGL: tipo de carta desconhecido "XYZ"');

      expect(run.warnings).toEqual(['SBGL: tipo de carta desconhecido "XYZ"']);
      expect(run.totals.airportsFailed).toBe(0);
    });

    it("reporta se houve alguma falha definitiva", () => {
      const run = report();
      expect(run.hasFailures).toBe(false);

      run.recordFailure("SBXX", "timeout");

      expect(run.hasFailures).toBe(true);
    });
  });

  describe("leitura imutável", () => {
    it("mutar a lista de falhas devolvida não altera o relatório", () => {
      const run = report();
      run.recordFailure("SBXX", "timeout");

      (run.failures as { icao: string; reason: string }[]).pop();

      expect(run.failures).toHaveLength(1);
    });

    it("mutar a lista de alertas devolvida não altera o relatório", () => {
      const run = report();
      run.recordWarning("alerta");

      (run.warnings as string[]).pop();

      expect(run.warnings).toHaveLength(1);
    });
  });

  describe("formatação do resumo", () => {
    it("formata totais, duração e as falhas identificadas", () => {
      const run = report();
      run.recordSuccess({
        icao: "SBGR",
        name: "Guarulhos",
        proceduresPersisted: 12,
        documentsArchived: 3,
        documentsAlreadyPresent: 9,
        documentsRemoved: 2,
      });
      run.recordFailure("SBXX", "timeout ao detalhar aeródromo, após 3 tentativas");

      const summary = run.format(new Date("2026-08-15T10:41:18Z"));

      expect(summary).toContain("Aeródromos processados : 2");
      expect(summary).toContain("sucesso              : 1");
      expect(summary).toContain("falha                : 1");
      expect(summary).toContain("Cartas persistidas     : 12");
      expect(summary).toContain("Documentos arquivados  : 3");
      expect(summary).toContain("Documentos já existentes: 9");
      expect(summary).toContain("Documentos removidos   : 2");
      expect(summary).toContain("Duração                : 41m18s");
      expect(summary).toContain("SBXX — timeout ao detalhar aeródromo, após 3 tentativas");
    });

    it("omite a seção de falhas quando não houve nenhuma", () => {
      const summary = report().format(new Date("2026-08-15T10:00:05Z"));

      expect(summary).not.toContain("Falhas:");
      expect(summary).toContain("Duração                : 5s");
    });

    it("lista os alertas acumulados", () => {
      const run = report();
      run.recordWarning('tipo de carta desconhecido "XYZ" em SBGL');

      const summary = run.format(new Date("2026-08-15T10:00:01Z"));

      expect(summary).toContain("Alertas:");
      expect(summary).toContain('tipo de carta desconhecido "XYZ" em SBGL');
    });

    it("formata duração de horas", () => {
      const summary = report().format(new Date("2026-08-15T12:03:04Z"));

      expect(summary).toContain("2h3m4s");
    });
  });
});
