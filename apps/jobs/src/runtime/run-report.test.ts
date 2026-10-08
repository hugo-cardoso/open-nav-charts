import { describe, expect, it } from "vitest";
import type { Clock } from "./clock.js";
import { type AirportOutcome, RunReport } from "./run-report.js";

function report(): RunReport {
  return new RunReport(new Date("2026-08-15T10:00:00Z"));
}

function written(overrides: Partial<AirportOutcome> = {}): AirportOutcome {
  return {
    icao: "SBGR",
    name: "Guarulhos",
    result: "written",
    runwaysCheck: null,
    runwaysReason: null,
    proceduresPersisted: 0,
    documentsArchived: 0,
    documentsAlreadyPresent: 0,
    documentsRemoved: 0,
    ...overrides,
  };
}

function confirmed(icao: string, reason: AirportOutcome["runwaysReason"]): AirportOutcome {
  return written({
    icao,
    result: "runways-confirmed",
    runwaysReason: reason,
    runwaysCheck: { icao, at: new Date("2026-08-15T10:00:00Z"), sourceUpdatedOn: null },
  });
}

/** Relógio que avança só quando o teste manda. */
class SteppingClock implements Clock {
  private current = 0;

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }

  async sleep(): Promise<void> {}
}

describe("RunReport", () => {
  describe("acumulação", () => {
    it("começa zerado", () => {
      expect(report().totals).toEqual({
        airportsProcessed: 0,
        airportsSucceeded: 0,
        airportsWritten: 0,
        airportsUnchanged: 0,
        airportsFailed: 0,
        runwaysRefreshed: 0,
        revalidationsDeferred: 0,
        chartsOutsideCatalog: 0,
        proceduresPersisted: 0,
        documentsArchived: 0,
        documentsAlreadyPresent: 0,
        documentsRemoved: 0,
      });
    });

    it("acumula aeródromos gravados com cartas e documentos", () => {
      const run = report();

      run.recordSuccess(
        written({
          proceduresPersisted: 12,
          documentsArchived: 3,
          documentsAlreadyPresent: 9,
          documentsRemoved: 1,
        }),
      );
      run.recordSuccess(written({ icao: "SBSP", proceduresPersisted: 8, documentsArchived: 8 }));

      expect(run.totals).toMatchObject({
        airportsProcessed: 2,
        airportsSucceeded: 2,
        airportsWritten: 2,
        proceduresPersisted: 20,
        documentsArchived: 11,
        documentsAlreadyPresent: 9,
        documentsRemoved: 1,
      });
    });

    it("conta como inalterado o aeródromo cujas pistas foram revalidadas sem mudança", () => {
      const run = report();

      run.recordUnchanged(10);
      run.recordSuccess(confirmed("SBGL", "age"));

      expect(run.totals).toMatchObject({
        airportsWritten: 0,
        airportsUnchanged: 11,
        runwaysRefreshed: 1,
      });
    });

    it("conta as revalidações de pistas por motivo", () => {
      const run = report();

      run.recordSuccess(confirmed("SBAA", "airac"));
      run.recordSuccess(confirmed("SBBB", "airac"));
      run.recordSuccess(written({ icao: "SBCC", runwaysReason: "new" }));
      run.recordSuccess(confirmed("SBDD", "age"));

      expect(run.runwaysRefreshedByReason).toEqual({ airac: 2, new: 1, age: 1 });
      expect(run.totals.runwaysRefreshed).toBe(4);
    });

    it("mantém gravados + inalterados + falhos igual ao total planejado", () => {
      const run = report();

      run.recordUnchanged(4486);
      run.recordSuccess(written());
      run.recordSuccess(confirmed("SBGL", "age"));
      run.recordAirportFailure("SI5J", "a fonte não publica detalhamento");
      // Falha de item (uma carta) não é aeródromo a mais.
      run.recordFailure("SBGR", "carta c1: PDF inválido");

      const totals = run.totals;
      expect(totals.airportsWritten + totals.airportsUnchanged + totals.airportsFailed).toBe(4489);
      expect(run.failures).toHaveLength(2);
    });

    it("acumula falhas de aeródromo de forma identificável", () => {
      const run = report();

      run.recordAirportFailure("SBXX", "timeout ao detalhar aeródromo, após 3 tentativas");

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

    it("reporta se houve alguma falha, de aeródromo ou de item", () => {
      const run = report();
      expect(run.hasFailures).toBe(false);

      run.recordFailure("SBXX", "carta c1: PDF inválido");

      expect(run.hasFailures).toBe(true);
    });
  });

  describe("tempo por etapa", () => {
    it("acumula o tempo de cada etapa, somando as linhas de trabalho", () => {
      const run = report();

      run.recordPhase("runways", 300);
      run.recordPhase("runways", 200);
      run.recordPhase("catalog", 6400);

      expect(run.phaseDurations).toEqual({ runways: 500, catalog: 6400 });
    });

    it("mede uma operação pelo relógio injetado, inclusive quando ela falha", async () => {
      const run = report();
      const clock = new SteppingClock();

      const value = await run.time("charts", clock, async () => {
        clock.advance(4800);
        return 42;
      });
      await expect(
        run.time("charts", clock, async () => {
          clock.advance(200);
          throw new Error("falhou");
        }),
      ).rejects.toThrow("falhou");

      expect(value).toBe(42);
      expect(run.phaseDurations).toEqual({ charts: 5000 });
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
    function fullRun(): RunReport {
      const run = report();
      run.recordSource({
        lastUpdate: "2026-09-30 17:35:34",
        airacCycle: "2026-10-01",
        observedAt: new Date("2026-09-30T23:00:00Z"),
      });
      run.recordUnchanged(4485);
      run.recordSuccess(
        written({
          runwaysReason: "new",
          proceduresPersisted: 12,
          documentsArchived: 3,
          documentsAlreadyPresent: 9,
          documentsRemoved: 2,
        }),
      );
      run.recordSuccess(confirmed("SBGL", "age"));
      run.recordAirportFailure("SBXX", "timeout ao detalhar aeródromo, após 3 tentativas");
      run.recordRevalidationsDeferred(7);
      run.recordChartsOutsideCatalog(32);
      run.recordPhase("catalog", 6400);
      run.recordPhase("runways", 201_000);
      return run;
    }

    it("formata a divisão do catálogo, que fecha com o total", () => {
      const summary = fullRun().format(new Date("2026-08-15T10:00:58Z"));

      expect(summary).toContain("Duração total            : 58s");
      expect(summary).toContain("Aeródromos no catálogo   : 4488");
      expect(summary).toContain("  gravados               : 1");
      expect(summary).toContain("  inalterados            : 4486");
      expect(summary).toContain("  falhos                 : 1");
    });

    it("formata o indicador da fonte e as revalidações por motivo", () => {
      const summary = fullRun().format(new Date("2026-08-15T10:00:58Z"));

      expect(summary).toContain(
        "Fonte                    : lastupdate 2026-09-30 17:35:34 · AIRAC 2026-10-01 (observado em 2026-09-30)",
      );
      expect(summary).toContain("Pistas revalidadas       : 2 (novos: 1 · idade: 1)");
      expect(summary).toContain("Revalidações adiadas     : 7");
      expect(summary).toContain("Cartas fora do catálogo  : 32");
    });

    it("formata cartas e documentos", () => {
      const summary = fullRun().format(new Date("2026-08-15T10:00:58Z"));

      expect(summary).toContain("Cartas persistidas       : 12");
      expect(summary).toContain("Documentos arquivados    : 3");
      expect(summary).toContain("Documentos já existentes : 9");
      expect(summary).toContain("Documentos removidos     : 2");
    });

    it("formata o tempo por etapa, com décimos abaixo de 10 s", () => {
      const summary = fullRun().format(new Date("2026-08-15T10:00:58Z"));

      expect(summary).toContain("Tempo por etapa (soma das linhas de trabalho):");
      expect(summary).toContain("  catálogo               : 6,4s");
      expect(summary).toContain("  pistas                 : 3m21s");
    });

    it("lista as falhas identificadas", () => {
      const summary = fullRun().format(new Date("2026-08-15T10:00:58Z"));

      expect(summary).toContain("SBXX — timeout ao detalhar aeródromo, após 3 tentativas");
    });

    it("na interrupção, usa o total planejado e mostra os não iniciados", () => {
      const run = report();
      run.recordPlanned(4491);
      run.recordSuccess(written());
      run.recordAirportFailure("SI5J", "a fonte não publica detalhamento");

      const summary = run.format(new Date("2026-08-15T10:01:16Z"));

      expect(summary).toContain("Aeródromos no catálogo   : 4491");
      expect(summary).toContain("  não iniciados          : 4489");
    });

    it("omite as seções vazias", () => {
      const summary = report().format(new Date("2026-08-15T10:00:05Z"));

      expect(summary).not.toContain("Falhas:");
      expect(summary).not.toContain("Fonte");
      expect(summary).not.toContain("Revalidações adiadas");
      expect(summary).not.toContain("não iniciados");
      expect(summary).not.toContain("Tempo por etapa");
      expect(summary).toContain("Duração total            : 5s");
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
