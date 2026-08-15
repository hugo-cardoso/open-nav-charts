import { type Coordinate, formatCoordinate } from "@open-nav-charts/core";

/**
 * Colaborador de saída. Abstrair a escrita mantém a CLI testável sem
 * monkey-patching de `console` (constituição, Princípio III).
 */
export interface Writer {
  write(line: string): void;
}

/** Escreve na saída padrão do processo. */
export class ConsoleWriter implements Writer {
  write(line: string): void {
    process.stdout.write(`${line}\n`);
  }
}

/** Imprime coordenadas formatadas usando `@open-nav-charts/core`. */
export class CoordinateReporter {
  readonly #writer: Writer;

  constructor(writer: Writer) {
    this.#writer = writer;
  }

  report(coordinates: readonly Coordinate[]): void {
    for (const coordinate of coordinates) {
      this.#writer.write(formatCoordinate(coordinate));
    }
  }
}

/** Composição do grafo de objetos — ponto de entrada explícito. */
export function main(writer: Writer = new ConsoleWriter()): void {
  const reporter = new CoordinateReporter(writer);

  reporter.report([
    { latitude: 38.7223, longitude: -9.1393 },
    { latitude: -22.9068, longitude: -43.1729 },
  ]);
}

// Executa apenas quando o módulo é o entrypoint, nunca quando importado por um teste.
if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  main();
}
