import type { AirportCatalogEntry, ChartSummary } from "@open-nav-charts/aisweb-client";
import type { AirportProcedure, AirportSnapshot } from "@open-nav-charts/domain";
import type { RunwaysReason } from "../../runtime/run-report.js";
import { sameCatalogData, sameProcedures, toProcedure } from "./airport-comparison.js";

/**
 * Por que as pistas de um aeródromo precisam ser revalidadas nesta execução
 * (research R5), em ordem de precedência:
 *
 * - `requested`: `--force`, ou o ICAO foi pedido em `--only`;
 * - `new`: o aeródromo ainda não está na base;
 * - `pending`: nunca houve coleta bem-sucedida das pistas;
 * - `source-updated`: o `<dt>` do registro ROTAER mudou desde a última coleta;
 * - `airac`: o conjunto IFR mudou (`lastupdate`/`emenda`) depois da última coleta;
 * - `age`: a última coleta passou de `revalidationDays` — limitada ao orçamento.
 */
export type { RunwaysReason };

/** O que mudou nos dados do aeródromo, além das pistas. */
export type WriteReason = "cadastro" | "cartas" | "documentos";

export interface AirportPlan {
  readonly entry: AirportCatalogEntry;
  readonly charts: readonly ChartSummary[];
  readonly snapshot: AirportSnapshot | undefined;
  /** `null`: as pistas persistidas continuam valendo, sem consultar o detalhamento. */
  readonly runwaysReason: RunwaysReason | null;
  /** Vazio: cadastro, cartas e documentos iguais aos persistidos. */
  readonly writeReasons: readonly WriteReason[];
}

export interface SyncPlan {
  readonly airports: readonly AirportPlan[];
  /** Cartas de ICAOs fora do catálogo `AD` — nunca coletadas, nem antes (research R2). */
  readonly chartsOutsideCatalog: readonly ChartSummary[];
  /** Vencidos por idade que ficaram para a próxima execução por causa do orçamento. */
  readonly agedOutDeferred: number;
}

export interface PlanOptions {
  readonly force: boolean;
  readonly only: readonly string[];
  readonly revalidationDays: number;
  readonly revalidationBudget: number;
  readonly skipDocuments: boolean;
}

export interface SyncPlanInput {
  readonly catalog: readonly AirportCatalogEntry[];
  readonly charts: readonly ChartSummary[];
  readonly snapshots: ReadonlyMap<string, AirportSnapshot>;
  /** Chaves presentes no bucket; `null` em `--skip-documents`, quando o bucket não é lido. */
  readonly archivedKeys: ReadonlySet<string> | null;
  readonly buildKey: (icao: string, procedureId: string) => string;
  /** Quando o indicador atual do conjunto IFR foi observado pela primeira vez. */
  readonly observedAt: Date | null;
  readonly now: Date;
  readonly options: PlanOptions;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Decide, sem I/O, o que fazer com cada aeródromo do catálogo (research R4).
 * É aqui que mora o atalho: um aeródromo sem `runwaysReason` e sem
 * `writeReasons` não gera requisição à fonte nem escrita no banco.
 */
export function planSync(input: SyncPlanInput): SyncPlan {
  const { options } = input;
  const requested = new Set(options.only.map((icao) => icao.toUpperCase()));
  const catalog =
    requested.size === 0
      ? input.catalog
      : input.catalog.filter((entry) => requested.has(entry.icao));

  const inCatalog = new Set(input.catalog.map((entry) => entry.icao));
  const chartsByIcao = new Map<string, ChartSummary[]>();
  const chartsOutsideCatalog: ChartSummary[] = [];
  for (const chart of input.charts) {
    if (!inCatalog.has(chart.airportIcao)) {
      chartsOutsideCatalog.push(chart);
      continue;
    }
    const group = chartsByIcao.get(chart.airportIcao);
    if (group === undefined) {
      chartsByIcao.set(chart.airportIcao, [chart]);
    } else {
      group.push(chart);
    }
  }

  const drafts = catalog.map((entry) => {
    const snapshot = input.snapshots.get(entry.icao);
    const charts = chartsByIcao.get(entry.icao) ?? [];
    return {
      entry,
      charts,
      snapshot,
      runwaysReason: runwaysReasonFor(entry, snapshot, input),
      writeReasons: snapshot === undefined ? [] : writeReasonsFor(entry, charts, snapshot, input),
    };
  });

  // Só a revalidação por idade é limitada: sem orçamento, todos os aeródromos
  // coletados juntos venceriam juntos 7 dias depois (research R5).
  const aged = drafts
    .filter((draft) => draft.runwaysReason === "age")
    .sort((a, b) => checkedAtOf(a.snapshot) - checkedAtOf(b.snapshot));
  const deferred = new Set(aged.slice(options.revalidationBudget).map((draft) => draft.entry.icao));

  return {
    airports: drafts.map(
      (draft): AirportPlan => ({
        ...draft,
        runwaysReason: deferred.has(draft.entry.icao) ? null : draft.runwaysReason,
      }),
    ),
    chartsOutsideCatalog,
    agedOutDeferred: deferred.size,
  };
}

function runwaysReasonFor(
  entry: AirportCatalogEntry,
  snapshot: AirportSnapshot | undefined,
  input: SyncPlanInput,
): RunwaysReason | null {
  const { options } = input;
  if (options.force || options.only.length > 0) {
    return "requested";
  }
  if (snapshot === undefined) {
    return "new";
  }
  const checkedAt = snapshot.runwaysCheckedAt;
  if (checkedAt === null) {
    return "pending";
  }
  if (entry.updatedOn !== null && entry.updatedOn !== snapshot.sourceUpdatedOn) {
    return "source-updated";
  }
  if (input.observedAt !== null && checkedAt < input.observedAt) {
    return "airac";
  }
  if (input.now.getTime() - checkedAt.getTime() > options.revalidationDays * DAY_MS) {
    return "age";
  }
  return null;
}

function writeReasonsFor(
  entry: AirportCatalogEntry,
  charts: readonly ChartSummary[],
  snapshot: AirportSnapshot,
  input: SyncPlanInput,
): WriteReason[] {
  const reasons: WriteReason[] = [];
  if (!sameCatalogData(entry, snapshot.airport)) {
    reasons.push("cadastro");
  }

  const persistedById = new Map(snapshot.procedures.map((procedure) => [procedure.id, procedure]));
  let missingDocument = false;
  const expected = charts.map((chart): AirportProcedure => {
    const persisted = persistedById.get(chart.id);
    if (input.archivedKeys === null) {
      // Sem ler o bucket, vale a chave já gravada — a coleta que pula os PDFs
      // não rebaixa a nulo um documento arquivado.
      return toProcedure(chart, persisted?.storageKey ?? null, persisted?.archivedAt ?? null);
    }
    const key = input.buildKey(chart.airportIcao, chart.id);
    if (!input.archivedKeys.has(key)) {
      missingDocument = true;
      return toProcedure(chart, null, null);
    }
    return toProcedure(chart, key, persisted?.archivedAt ?? null);
  });

  if (missingDocument) {
    reasons.push("documentos");
  } else if (!sameProcedures(expected, snapshot.procedures)) {
    reasons.push("cartas");
  }
  return reasons;
}

function checkedAtOf(snapshot: AirportSnapshot | undefined): number {
  return snapshot?.runwaysCheckedAt?.getTime() ?? 0;
}
