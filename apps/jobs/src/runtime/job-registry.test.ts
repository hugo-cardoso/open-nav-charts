import { describe, expect, it } from "vitest";
import type { Job } from "./job.js";
import { DuplicateJobError, JobRegistry, UnknownJobError } from "./job-registry.js";
import { RunReport } from "./run-report.js";

function fakeJob(name: string, description = `rotina ${name}`): Job {
  return {
    name,
    description,
    run: async () => new RunReport(new Date()),
  };
}

describe("JobRegistry", () => {
  it("resolve a rotina pelo nome", () => {
    const registry = new JobRegistry();
    const job = fakeJob("decea-crawler");
    registry.register(job);

    expect(registry.resolve("decea-crawler")).toBe(job);
  });

  it("rejeita nome duplicado", () => {
    const registry = new JobRegistry();
    registry.register(fakeJob("decea-crawler"));

    expect(() => registry.register(fakeJob("decea-crawler"))).toThrow(DuplicateJobError);
  });

  it("falha ao resolver rotina desconhecida", () => {
    const registry = new JobRegistry();
    registry.register(fakeJob("decea-crawler"));

    expect(() => registry.resolve("inexistente")).toThrow(UnknownJobError);
  });

  it("nomeia as rotinas disponíveis na mensagem de rotina desconhecida", () => {
    const registry = new JobRegistry();
    registry.register(fakeJob("decea-crawler"));

    expect(() => registry.resolve("inexistente")).toThrow(/decea-crawler/);
  });

  it("lista as rotinas registradas para o --help", () => {
    const registry = new JobRegistry();
    registry.register(fakeJob("decea-crawler", "Coleta do DECEA"));
    registry.register(fakeJob("outra-rotina", "Outra coisa"));

    expect(registry.list().map((job) => [job.name, job.description])).toEqual([
      ["decea-crawler", "Coleta do DECEA"],
      ["outra-rotina", "Outra coisa"],
    ]);
  });

  it("registrar uma rotina nova não altera as existentes", () => {
    const registry = new JobRegistry();
    const first = fakeJob("decea-crawler");
    registry.register(first);

    registry.register(fakeJob("outra-rotina"));

    expect(registry.resolve("decea-crawler")).toBe(first);
  });

  it("devolve lista imutável", () => {
    const registry = new JobRegistry();
    registry.register(fakeJob("decea-crawler"));

    const listed = registry.list();
    expect(listed).toHaveLength(1);
    // Mutar a leitura não pode contaminar o registro.
    (listed as Job[]).pop();
    expect(registry.list()).toHaveLength(1);
  });
});
