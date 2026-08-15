#!/usr/bin/env node
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import { CompositionRoot } from "./composition-root.js";
import { EnvironmentConfig, InvalidConfigurationError } from "./config/environment-config.js";
import type { Logger } from "./observability/logger.js";

/**
 * `server.close()` espera indefinidamente por conexões keep-alive ociosas, o que
 * travaria a reimplantação. O limite força a saída (FR-033, research R11).
 */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface StartedServer {
  readonly server: Server;
  readonly port: number;
  stop(): Promise<void>;
}

/** Sobe o servidor e devolve o encerramento ordenado. Não trata sinais. */
export async function start(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<StartedServer> {
  const config = EnvironmentConfig.fromEnvironment(environment);
  const root = new CompositionRoot({ config });
  const app = root.buildApp();

  const server = await new Promise<Server>((resolve, reject) => {
    // Bind explícito em todas as interfaces: dentro de um contêiner, escutar
    // apenas o loopback torna o serviço inalcançável para a verificação de saúde.
    const listening = app.listen(config.server.port, "0.0.0.0");
    listening.once("listening", () => resolve(listening));
    listening.once("error", reject);
  });

  root.logger.info("API no ar", { port: config.server.port, logLevel: config.server.logLevel });

  return {
    server,
    port: config.server.port,
    stop: async () => {
      await closeServer(server, root.logger);
      await root.close();
    },
  };
}

/** Aguarda as requisições em curso; o tempo limite impede a espera infinita. */
async function closeServer(server: Server, logger: Logger): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      logger.warn("encerramento forçado: conexões ainda abertas", {
        timeoutMs: SHUTDOWN_TIMEOUT_MS,
      });
      server.closeAllConnections();
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function main(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  let started: StartedServer;
  try {
    started = await start(environment);
  } catch (error) {
    // Configuração inválida não sobe o processo, e a mensagem lista todas as
    // ausências de uma vez (FR-034).
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return error instanceof InvalidConfigurationError ? 2 : 1;
  }

  await new Promise<void>((resolve) => {
    const onSignal = (): void => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      resolve();
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });

  await started.stop();
  return 0;
}

// Só executa quando invocado como binário, nunca quando importado por teste.
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  process.exitCode = await main(process.env);
}
