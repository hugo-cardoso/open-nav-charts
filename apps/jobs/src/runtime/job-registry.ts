import type { Job } from "./job.js";

export class DuplicateJobError extends Error {
  override readonly name = "DuplicateJobError";
}

export class UnknownJobError extends Error {
  override readonly name = "UnknownJobError";
}

/**
 * Registro de rotinas do host. Adicionar uma rotina é registrar mais uma
 * implementação de `Job` — nenhuma existente é tocada (FR-002, FR-003).
 */
export class JobRegistry {
  private readonly jobs = new Map<string, Job>();

  register(job: Job): void {
    if (this.jobs.has(job.name)) {
      throw new DuplicateJobError(`já existe uma rotina registrada com o nome "${job.name}"`);
    }
    this.jobs.set(job.name, job);
  }

  resolve(name: string): Job {
    const job = this.jobs.get(name);
    if (job === undefined) {
      const available = [...this.jobs.keys()].join(", ");
      throw new UnknownJobError(
        `rotina "${name}" não existe. Disponíveis: ${available === "" ? "nenhuma" : available}`,
      );
    }
    return job;
  }

  /** Cópia: mutar a leitura não contamina o registro (Princípio III, regra 6). */
  list(): readonly Job[] {
    return [...this.jobs.values()];
  }
}
