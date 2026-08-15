#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import { CompositionRoot, type JobOptionsByName } from "./composition-root.js";
import { EnvironmentConfig } from "./config/environment-config.js";
import { SystemClock } from "./runtime/clock.js";
import {
  ExitCode,
  type ExitCodeValue,
  exitCodeForError,
  exitCodeForReport,
} from "./runtime/exit-code.js";
import type { OutputWriter } from "./runtime/progress-reporter.js";

const stdoutWriter: OutputWriter = {
  write: (line: string) => {
    process.stdout.write(`${line}\n`);
  },
};

function positiveInteger(name: string): (value: string) => number {
  return (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new InvalidArgumentError(`${name} deve ser um inteiro maior que zero`);
    }
    return parsed;
  };
}

function icaoList(value: string): readonly string[] {
  return value
    .split(",")
    .map((icao) => icao.trim().toUpperCase())
    .filter((icao) => icao.length > 0);
}

/**
 * Executa a rotina pelo nome, sem conhecer nenhuma em particular: o registro
 * resolve o nome e o host apenas trata sinais, resumo e código de saída. É o que
 * permite acrescentar rotinas sem tocar nesta função (FR-002, FR-003).
 */
async function runJob(name: string, jobOptions: JobOptionsByName): Promise<ExitCodeValue> {
  const config = EnvironmentConfig.fromEnvironment(process.env);
  const root = new CompositionRoot({ config, writer: stdoutWriter, clock: new SystemClock() });
  const controller = new AbortController();
  let interrupted = false;

  const onSignal = (): void => {
    interrupted = true;
    controller.abort();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    // Migrações antes da coleta: sem esquema não há o que gravar (FR-032).
    await root.migrate();

    const progress = root.progress;
    const job = root.buildRegistry(progress, jobOptions).resolve(name);

    const report = await job.run(controller.signal);

    // O resumo sai inclusive em interrupção (FR-026).
    progress.summary(report.format(new Date()));
    return exitCodeForReport(report, interrupted);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    // O pool do banco e o cliente S3 são fechados pela raiz de composição em
    // qualquer desfecho, inclusive interrupção (Princípio III).
    await root.close();
  }
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("open-nav-charts-jobs")
    .description("Host de rotinas operacionais do open-nav-charts")
    .version("0.1.0")
    .showHelpAfterError();

  program
    .command("decea-crawler")
    .description("Coleta aeródromos, cartas IFR e documentos do DECEA")
    .option("--page-size <n>", "tamanho da página do catálogo", positiveInteger("--page-size"), 100)
    .option(
      "--concurrency <n>",
      "aeródromos processados simultaneamente",
      positiveInteger("--concurrency"),
      4,
    )
    .option("--max-attempts <n>", "tentativas por aeródromo", positiveInteger("--max-attempts"), 3)
    .option("--skip-documents", "coleta metadados sem baixar os PDFs", false)
    .option("--only <ICAO,ICAO>", "restringe a varredura aos ICAOs informados", icaoList, [])
    .action(
      async (
        options: {
          pageSize: number;
          concurrency: number;
          maxAttempts: number;
          skipDocuments: boolean;
          only: readonly string[];
        },
        command: Command,
      ) => {
        // `command.name()` é o subcomando que o operador escreveu — o host não
        // repete o nome da rotina em lado nenhum.
        process.exitCode = await runJob(command.name(), {
          "decea-crawler": {
            pageSize: options.pageSize,
            concurrency: options.concurrency,
            maxAttempts: options.maxAttempts,
            skipDocuments: options.skipDocuments,
            only: options.only,
          },
        });
      },
    );

  return program;
}

export async function main(argv: readonly string[]): Promise<ExitCodeValue> {
  try {
    await buildProgram().parseAsync([...argv]);
    const code = process.exitCode;
    return typeof code === "number" ? (code as ExitCodeValue) : ExitCode.Success;
  } catch (error) {
    const code = exitCodeForError(error);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return code;
  }
}

// Só executa quando invocado como binário, nunca quando importado por teste.
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  process.exitCode = await main(process.argv);
}
