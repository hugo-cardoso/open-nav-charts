import { describe, expect, it } from "vitest";
import { ConsoleProgressReporter, type OutputWriter } from "./progress-reporter.js";

class CapturingWriter implements OutputWriter {
  readonly lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }
}

function reporter(): { reporter: ConsoleProgressReporter; writer: CapturingWriter } {
  const writer = new CapturingWriter();
  return { reporter: new ConsoleProgressReporter(writer), writer };
}

describe("ConsoleProgressReporter", () => {
  it("anuncia o início com total, páginas e concorrência", () => {
    const { reporter: subject, writer } = reporter();

    subject.jobStarted(4550, 46, 4);

    expect(writer.lines[0]).toBe(
      "[decea-crawler] Iniciando. 4550 aeródromos em 46 páginas, 4 simultâneos.",
    );
  });

  it("anuncia início de página no formato n/N", () => {
    const { reporter: subject, writer } = reporter();

    subject.pageStarted(1, 46);

    expect(writer.lines[0]).toBe("[decea-crawler] Página 1/46 iniciada.");
  });

  it("anuncia fim de página com a duração em segundos", () => {
    const { reporter: subject, writer } = reporter();

    subject.pageFinished(1, 46, 34_000);

    expect(writer.lines[0]).toBe("[decea-crawler] Página 1/46 concluída em 34s.");
  });

  it("emite uma linha por aeródromo com ICAO, nome e contagem de cartas", () => {
    const { reporter: subject, writer } = reporter();

    subject.airportSucceeded("SBGR", "Guarulhos", 12);

    expect(writer.lines[0]).toContain("SBGR");
    expect(writer.lines[0]).toContain("Guarulhos");
    expect(writer.lines[0]).toContain("12 cartas");
    expect(writer.lines[0]).toMatch(/ok$/);
  });

  it("emite a tentativa no formato n/3 com o motivo", () => {
    const { reporter: subject, writer } = reporter();

    subject.airportRetrying("SBXX", 2, 3, "timeout");

    expect(writer.lines[0]).toContain("SBXX");
    expect(writer.lines[0]).toContain("tentativa 2/3: timeout");
  });

  it("emite a falha definitiva de forma identificável", () => {
    const { reporter: subject, writer } = reporter();

    subject.airportFailed("SBXX", "timeout após 3 tentativas");

    expect(writer.lines[0]).toContain("SBXX");
    expect(writer.lines[0]).toContain("FALHA: timeout após 3 tentativas");
  });

  it("anuncia a interrupção solicitada", () => {
    const { reporter: subject, writer } = reporter();

    subject.interrupted();

    expect(writer.lines[0]).toMatch(/Interrupção/);
  });

  it("prefixa cada linha do resumo, preservando as vazias", () => {
    const { reporter: subject, writer } = reporter();

    subject.summary("Resumo\n  total : 1\n\n  Falhas:");

    expect(writer.lines).toEqual([
      "[decea-crawler] Resumo",
      "[decea-crawler]   total : 1",
      "",
      "[decea-crawler]   Falhas:",
    ]);
  });
});
