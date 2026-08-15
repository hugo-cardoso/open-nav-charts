export interface RunTotals {
  readonly airportsProcessed: number;
  readonly airportsSucceeded: number;
  readonly airportsFailed: number;
  readonly proceduresPersisted: number;
  readonly documentsArchived: number;
  readonly documentsAlreadyPresent: number;
  readonly documentsRemoved: number;
}

export interface AirportOutcome {
  readonly icao: string;
  readonly name: string;
  readonly proceduresPersisted: number;
  readonly documentsArchived: number;
  readonly documentsAlreadyPresent: number;
  readonly documentsRemoved: number;
}

export interface RunFailure {
  readonly icao: string;
  readonly reason: string;
}

/**
 * Acumula sucessos, falhas e alertas da execução (FR-026, FR-027). Estado em
 * campos privados; a leitura devolve cópias (Princípio III, regra 6).
 */
export class RunReport {
  // Prefixo `_` nos campos cujo nome o getter público também usa — `private`
  // não permite campo e acessor homônimos na mesma classe.
  private readonly _startedAt: Date;
  private readonly _failures: RunFailure[] = [];
  private readonly _warnings: string[] = [];
  private airportsSucceeded = 0;
  private proceduresPersisted = 0;
  private documentsArchived = 0;
  private documentsAlreadyPresent = 0;
  private documentsRemoved = 0;

  constructor(startedAt: Date) {
    this._startedAt = startedAt;
  }

  get startedAt(): Date {
    return new Date(this._startedAt);
  }

  recordSuccess(outcome: AirportOutcome): void {
    this.airportsSucceeded += 1;
    this.proceduresPersisted += outcome.proceduresPersisted;
    this.documentsArchived += outcome.documentsArchived;
    this.documentsAlreadyPresent += outcome.documentsAlreadyPresent;
    this.documentsRemoved += outcome.documentsRemoved;
  }

  recordFailure(icao: string, reason: string): void {
    this._failures.push({ icao, reason });
  }

  recordWarning(message: string): void {
    this._warnings.push(message);
  }

  get totals(): RunTotals {
    return {
      airportsProcessed: this.airportsSucceeded + this._failures.length,
      airportsSucceeded: this.airportsSucceeded,
      airportsFailed: this._failures.length,
      proceduresPersisted: this.proceduresPersisted,
      documentsArchived: this.documentsArchived,
      documentsAlreadyPresent: this.documentsAlreadyPresent,
      documentsRemoved: this.documentsRemoved,
    };
  }

  get failures(): readonly RunFailure[] {
    return [...this._failures];
  }

  get warnings(): readonly string[] {
    return [...this._warnings];
  }

  get hasFailures(): boolean {
    return this._failures.length > 0;
  }

  /** Resumo final no formato de `contracts/jobs-cli.md`. */
  format(finishedAt: Date): string {
    const totals = this.totals;
    const lines = [
      "Resumo",
      `  Aeródromos processados : ${totals.airportsProcessed}`,
      `    sucesso              : ${totals.airportsSucceeded}`,
      `    falha                : ${totals.airportsFailed}`,
      `  Cartas persistidas     : ${totals.proceduresPersisted}`,
      `  Documentos arquivados  : ${totals.documentsArchived}`,
      `  Documentos já existentes: ${totals.documentsAlreadyPresent}`,
      `  Documentos removidos   : ${totals.documentsRemoved}`,
      `  Duração                : ${formatDuration(finishedAt.getTime() - this._startedAt.getTime())}`,
    ];

    if (this._failures.length > 0) {
      lines.push("", "  Falhas:");
      for (const failure of this._failures) {
        lines.push(`    ${failure.icao} — ${failure.reason}`);
      }
    }

    if (this._warnings.length > 0) {
      lines.push("", "  Alertas:");
      for (const warning of this._warnings) {
        lines.push(`    ${warning}`);
      }
    }

    return lines.join("\n");
  }
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${minutes}m${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }
  return `${seconds}s`;
}
