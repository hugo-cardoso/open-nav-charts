import { LOG_LEVELS, type LogLevel } from "../config/environment-config.js";

/** Campos estruturados que acompanham a linha de log. */
export type LogFields = Readonly<Record<string, unknown>>;

/**
 * Contrato injetado nas rotas e serviços. Uma interface própria — e não o tipo
 * de uma biblioteca — é o que permite trocar a implementação por `pino` depois
 * sem tocar em quem registra (research R8).
 */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface LogSink {
  write(line: string): void;
}

export interface JsonLoggerOptions {
  readonly level: LogLevel;
  readonly sink?: LogSink;
  readonly now?: () => Date;
}

const consoleSink: LogSink = {
  write: (line: string) => {
    process.stdout.write(`${line}\n`);
  },
};

/**
 * Uma linha JSON por evento. O volume desta API é uma linha por requisição, o
 * que não justifica dependência de biblioteca de log (research R8).
 */
export class JsonLogger implements Logger {
  private readonly threshold: number;
  private readonly sink: LogSink;
  private readonly now: () => Date;

  constructor(options: JsonLoggerOptions) {
    this.threshold = LOG_LEVELS.indexOf(options.level);
    this.sink = options.sink ?? consoleSink;
    this.now = options.now ?? (() => new Date());
  }

  debug(message: string, fields?: LogFields): void {
    this.emit("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.emit("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.emit("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.emit("error", message, fields);
  }

  private emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LOG_LEVELS.indexOf(level) < this.threshold) {
      return;
    }
    this.sink.write(
      JSON.stringify({
        timestamp: this.now().toISOString(),
        level,
        message,
        ...fields,
      }),
    );
  }
}

/** Descarta tudo. Para testes que não asseveram log. */
export class NullLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/** Guarda as linhas em memória, para os testes asseverarem o que foi registrado. */
export class RecordingLogger implements Logger {
  readonly entries: { level: LogLevel; message: string; fields: LogFields }[] = [];

  debug(message: string, fields: LogFields = {}): void {
    this.entries.push({ level: "debug", message, fields });
  }

  info(message: string, fields: LogFields = {}): void {
    this.entries.push({ level: "info", message, fields });
  }

  warn(message: string, fields: LogFields = {}): void {
    this.entries.push({ level: "warn", message, fields });
  }

  error(message: string, fields: LogFields = {}): void {
    this.entries.push({ level: "error", message, fields });
  }
}
