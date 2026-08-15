import { describe, expect, it } from "vitest";
import { CoordinateReporter, main, type Writer } from "./index.js";

/** Writer de teste — substitui a saída real sem monkey-patching. */
class MemoryWriter implements Writer {
  readonly lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }
}

describe("CoordinateReporter", () => {
  it("escreve uma linha formatada por coordenada", () => {
    const writer = new MemoryWriter();

    new CoordinateReporter(writer).report([
      { latitude: 38.7223, longitude: -9.1393 },
      { latitude: 0, longitude: 0 },
    ]);

    expect(writer.lines).toEqual(["38.7223° N, 9.1393° W", "0.0000° N, 0.0000° E"]);
  });

  it("não escreve nada para uma lista vazia", () => {
    const writer = new MemoryWriter();

    new CoordinateReporter(writer).report([]);

    expect(writer.lines).toEqual([]);
  });

  it("propaga o erro de coordenada inválida vindo do core", () => {
    const writer = new MemoryWriter();

    expect(() => new CoordinateReporter(writer).report([{ latitude: 91, longitude: 0 }])).toThrow(
      RangeError,
    );
  });
});

describe("main", () => {
  it("reporta as coordenadas de exemplo no writer injetado", () => {
    const writer = new MemoryWriter();

    main(writer);

    expect(writer.lines).toHaveLength(2);
    expect(writer.lines[0]).toContain("° N");
    expect(writer.lines[1]).toContain("° S");
  });
});
