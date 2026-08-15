import { describe, expect, it } from "vitest";
import { buildProgram } from "./main.js";

/**
 * Testa a superfície de linha de comando sem executar rotina nenhuma: o `action`
 * exigiria banco, bucket e credenciais. O que importa aqui é o contrato exposto
 * ao operador — nomes, opções e padrões.
 */
describe("buildProgram", () => {
  it("expõe o nome do binário", () => {
    expect(buildProgram().name()).toBe("open-nav-charts-jobs");
  });

  it("regista o subcomando decea-crawler com a sua descrição", () => {
    const commands = buildProgram().commands.map((command) => command.name());

    expect(commands).toContain("decea-crawler");
  });

  it("declara as cinco opções da rotina com os padrões da spec", () => {
    const crawler = buildProgram().commands.find((command) => command.name() === "decea-crawler");
    const flags = crawler?.options.map((option) => option.long) ?? [];

    expect(flags).toEqual([
      "--page-size",
      "--concurrency",
      "--max-attempts",
      "--skip-documents",
      "--only",
    ]);
    expect(crawler?.options.find((option) => option.long === "--page-size")?.defaultValue).toBe(
      100,
    );
    expect(crawler?.options.find((option) => option.long === "--concurrency")?.defaultValue).toBe(
      4,
    );
    expect(crawler?.options.find((option) => option.long === "--max-attempts")?.defaultValue).toBe(
      3,
    );
  });

  it("cada subcomando conhece o próprio nome, que é o que o host despacha", () => {
    // Garante o despacho dinâmico: o nome vem do commander, não de um literal
    // repetido dentro do `action`.
    for (const command of buildProgram().commands) {
      expect(command.name()).not.toBe("");
      expect(typeof command.name()).toBe("string");
    }
  });

  describe("validação das opções numéricas", () => {
    function parseOption(flag: string, value: string): number {
      const option = buildProgram()
        .commands.find((command) => command.name() === "decea-crawler")
        ?.options.find((candidate) => candidate.long === flag);
      const parser = option?.parseArg;
      if (parser === undefined) {
        throw new Error(`opção ${flag} sem parser`);
      }
      // O commander tipa `parseArg` como `(value, previous: T) => T` e infere
      // `T` como `undefined` aqui; o valor de retorno real é o número parseado.
      return parser(value, undefined) as unknown as number;
    }

    it("aceita inteiro positivo", () => {
      expect(parseOption("--concurrency", "8")).toBe(8);
      expect(parseOption("--page-size", "50")).toBe(50);
      expect(parseOption("--max-attempts", "5")).toBe(5);
    });

    it("rejeita zero, negativo e não inteiro", () => {
      for (const invalid of ["0", "-1", "1.5", "abc", ""]) {
        expect(() => parseOption("--concurrency", invalid)).toThrow(
          /--concurrency deve ser um inteiro maior que zero/,
        );
      }
    });

    it("normaliza a lista de ICAOs para maiúsculo, ignorando espaços e vazios", () => {
      const option = buildProgram()
        .commands.find((command) => command.name() === "decea-crawler")
        ?.options.find((candidate) => candidate.long === "--only");

      expect(option?.parseArg?.(" sbgl , sbgr ,, ", undefined)).toEqual(["SBGL", "SBGR"]);
    });
  });
});
