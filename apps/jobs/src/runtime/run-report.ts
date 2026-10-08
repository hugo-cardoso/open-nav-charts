import type { RunwaysCheckOf } from "@open-nav-charts/domain";
import type { Clock } from "./clock.js";

export interface RunTotals {
  /** Aeródromos que entraram na fila: sucessos e falhas. */
  readonly airportsProcessed: number;
  /** Gravados mais os que só tiveram as pistas confirmadas. */
  readonly airportsSucceeded: number;
  /** Aeródromos gravados: cadastro, pistas, cartas ou documentos mudaram. */
  readonly airportsWritten: number;
  /** Sem mudança de dado: pulados pelo plano ou com pistas confirmadas iguais. */
  readonly airportsUnchanged: number;
  readonly airportsFailed: number;
  /** Detalhamentos (pistas) consultados com sucesso. */
  readonly runwaysRefreshed: number;
  /** Vencidos por idade que o orçamento deixou para a execução seguinte. */
  readonly revalidationsDeferred: number;
  /** Cartas do lote IFR de aeródromos fora do catálogo `AD`, descartadas. */
  readonly chartsOutsideCatalog: number;
  readonly proceduresPersisted: number;
  readonly documentsArchived: number;
  readonly documentsAlreadyPresent: number;
  readonly documentsRemoved: number;
}

/**
 * Por que as pistas de um aeródromo foram revalidadas (research R5). A regra
 * mora no planejador da rotina; o relatório só conta.
 */
export type RunwaysReason = "requested" | "new" | "pending" | "source-updated" | "airac" | "age";

/**
 * - `written`: o aeródromo foi gravado (cadastro, pistas, cartas ou documentos);
 * - `runways-confirmed`: as pistas foram revalidadas e nada mudou.
 */
export type AirportResult = "written" | "runways-confirmed";

export interface AirportOutcome {
  readonly icao: string;
  readonly name: string;
  readonly result: AirportResult;
  /** Revalidação bem-sucedida das pistas nesta execução, quando houve. */
  readonly runwaysCheck: RunwaysCheckOf | null;
  readonly runwaysReason: RunwaysReason | null;
  readonly proceduresPersisted: number;
  readonly documentsArchived: number;
  readonly documentsAlreadyPresent: number;
  readonly documentsRemoved: number;
}

export interface RunFailure {
  readonly icao: string;
  readonly reason: string;
}

/** Etapas medidas no resumo (research R9). */
export type Phase = "catalog" | "charts" | "runways" | "documents" | "database";

/** Indicador do conjunto IFR observado nesta execução. */
export interface ObservedSource {
  readonly lastUpdate: string | null;
  readonly airacCycle: string | null;
  readonly observedAt: Date;
}

const REASON_LABELS: Readonly<Record<RunwaysReason, string>> = {
  requested: "pedidos",
  new: "novos",
  pending: "pendentes",
  "source-updated": "ROTAER",
  airac: "AIRAC",
  age: "idade",
};

const PHASE_LABELS: Readonly<Record<Phase, string>> = {
  catalog: "catálogo",
  charts: "cartas",
  runways: "pistas",
  documents: "documentos",
  database: "banco",
};

/**
 * Acumula sucessos, falhas, alertas e tempos da execução. Estado em campos
 * privados; a leitura devolve cópias (Princípio III, regra 6).
 */
export class RunReport {
  // Prefixo `_` nos campos cujo nome o getter público também usa — `private`
  // não permite campo e acessor homônimos na mesma classe.
  private readonly _startedAt: Date;
  private readonly _failures: RunFailure[] = [];
  private readonly _warnings: string[] = [];
  private readonly runwaysByReason = new Map<RunwaysReason, number>();
  private readonly phases = new Map<Phase, number>();
  private source: ObservedSource | null = null;
  private planned: number | null = null;
  private airportsWritten = 0;
  private airportsConfirmed = 0;
  private airportsSkipped = 0;
  private airportsFailed = 0;
  private revalidationsDeferred = 0;
  private chartsOutsideCatalog = 0;
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
    if (outcome.result === "written") {
      this.airportsWritten += 1;
    } else {
      this.airportsConfirmed += 1;
    }
    if (outcome.runwaysReason !== null) {
      this.runwaysByReason.set(
        outcome.runwaysReason,
        (this.runwaysByReason.get(outcome.runwaysReason) ?? 0) + 1,
      );
    }
    this.proceduresPersisted += outcome.proceduresPersisted;
    this.documentsArchived += outcome.documentsArchived;
    this.documentsAlreadyPresent += outcome.documentsAlreadyPresent;
    this.documentsRemoved += outcome.documentsRemoved;
  }

  /** Aeródromos do plano: o total contra o qual o resumo fecha a conta. */
  recordPlanned(count: number): void {
    this.planned = count;
  }

  /** Aeródromos que o plano deixou como estavam, sem requisição nem escrita. */
  recordUnchanged(count: number): void {
    this.airportsSkipped += count;
  }

  recordRevalidationsDeferred(count: number): void {
    this.revalidationsDeferred += count;
  }

  recordChartsOutsideCatalog(count: number): void {
    this.chartsOutsideCatalog += count;
  }

  recordSource(source: ObservedSource): void {
    this.source = source;
  }

  /** O aeródromo inteiro falhou: entra na conta do catálogo e na lista de falhas. */
  recordAirportFailure(icao: string, reason: string): void {
    this.airportsFailed += 1;
    this._failures.push({ icao, reason });
  }

  /**
   * Falha de um item — uma carta, um ICAO pedido que a fonte não tem. Aparece
   * na lista, mas não é um aeródromo a mais na conta do catálogo.
   */
  recordFailure(icao: string, reason: string): void {
    this._failures.push({ icao, reason });
  }

  recordWarning(message: string): void {
    this._warnings.push(message);
  }

  recordPhase(phase: Phase, milliseconds: number): void {
    this.phases.set(phase, (this.phases.get(phase) ?? 0) + milliseconds);
  }

  /** Mede `operation` pelo relógio injetado e soma à etapa, mesmo se falhar. */
  async time<T>(phase: Phase, clock: Clock, operation: () => Promise<T>): Promise<T> {
    const startedAt = clock.now().getTime();
    try {
      return await operation();
    } finally {
      this.recordPhase(phase, clock.now().getTime() - startedAt);
    }
  }

  get totals(): RunTotals {
    const succeeded = this.airportsWritten + this.airportsConfirmed;
    return {
      airportsProcessed: succeeded + this.airportsFailed,
      airportsSucceeded: succeeded,
      airportsWritten: this.airportsWritten,
      airportsUnchanged: this.airportsSkipped + this.airportsConfirmed,
      airportsFailed: this.airportsFailed,
      runwaysRefreshed: [...this.runwaysByReason.values()].reduce((sum, count) => sum + count, 0),
      revalidationsDeferred: this.revalidationsDeferred,
      chartsOutsideCatalog: this.chartsOutsideCatalog,
      proceduresPersisted: this.proceduresPersisted,
      documentsArchived: this.documentsArchived,
      documentsAlreadyPresent: this.documentsAlreadyPresent,
      documentsRemoved: this.documentsRemoved,
    };
  }

  get runwaysRefreshedByReason(): Readonly<Partial<Record<RunwaysReason, number>>> {
    return Object.fromEntries(this.runwaysByReason);
  }

  get phaseDurations(): Readonly<Partial<Record<Phase, number>>> {
    return Object.fromEntries(this.phases);
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

  /**
   * Resumo final no formato de `contracts/jobs-cli.md` da feature 007. A meta de
   * duração (SC-001) se verifica pela duração total; o tempo por etapa soma as
   * linhas de trabalho e pode excedê-la.
   */
  format(finishedAt: Date): string {
    const totals = this.totals;
    const accounted = totals.airportsWritten + totals.airportsUnchanged + totals.airportsFailed;
    // Numa execução interrompida, parte do plano nem começou; sem o total
    // planejado, o resumo mostraria só o que foi visto.
    const inCatalog = this.planned ?? accounted;
    const lines = [
      "Resumo",
      line("Duração total", formatDuration(finishedAt.getTime() - this._startedAt.getTime())),
    ];

    if (this.source !== null) {
      lines.push(line("Fonte", formatSource(this.source)));
    }

    lines.push(
      line("Aeródromos no catálogo", inCatalog),
      line("  gravados", totals.airportsWritten),
      line("  inalterados", totals.airportsUnchanged),
      line("  falhos", totals.airportsFailed),
    );
    if (inCatalog > accounted) {
      lines.push(line("  não iniciados", inCatalog - accounted));
    }
    lines.push(line("Pistas revalidadas", this.formatRunways(totals.runwaysRefreshed)));
    if (totals.revalidationsDeferred > 0) {
      lines.push(line("Revalidações adiadas", totals.revalidationsDeferred));
    }
    lines.push(
      line("Cartas persistidas", totals.proceduresPersisted),
      line("Cartas fora do catálogo", totals.chartsOutsideCatalog),
      line("Documentos arquivados", totals.documentsArchived),
      line("Documentos já existentes", totals.documentsAlreadyPresent),
      line("Documentos removidos", totals.documentsRemoved),
    );

    if (this.phases.size > 0) {
      lines.push("", "  Tempo por etapa (soma das linhas de trabalho):");
      for (const phase of Object.keys(PHASE_LABELS) as Phase[]) {
        const milliseconds = this.phases.get(phase);
        if (milliseconds !== undefined) {
          lines.push(line(`  ${PHASE_LABELS[phase]}`, formatPhase(milliseconds)));
        }
      }
    }

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

  private formatRunways(total: number): string {
    const parts = (Object.keys(REASON_LABELS) as RunwaysReason[])
      .filter((reason) => this.runwaysByReason.has(reason))
      .map((reason) => `${REASON_LABELS[reason]}: ${this.runwaysByReason.get(reason)}`);
    return parts.length === 0 ? String(total) : `${total} (${parts.join(" · ")})`;
  }
}

/** Rótulos alinhados em coluna, como no resumo da feature 002. */
function line(label: string, value: string | number): string {
  return `  ${label.padEnd(24)} : ${value}`;
}

function formatSource(source: ObservedSource): string {
  const observedOn = source.observedAt.toISOString().slice(0, 10);
  return `lastupdate ${source.lastUpdate ?? "ilegível"} · AIRAC ${
    source.airacCycle ?? "ilegível"
  } (observado em ${observedOn})`;
}

/** Abaixo de 10 s, com décimos — boa parte das etapas cabe aí. */
function formatPhase(milliseconds: number): string {
  if (milliseconds < 10_000) {
    return `${(milliseconds / 1000).toFixed(1).replace(".", ",")}s`;
  }
  return formatDuration(milliseconds);
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
