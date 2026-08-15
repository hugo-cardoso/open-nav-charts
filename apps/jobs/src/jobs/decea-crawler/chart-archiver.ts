import {
  type AisWebClient,
  type ChartSummary,
  isRetryableSourceError,
} from "@open-nav-charts/aisweb-client";
import type { ChartStorage } from "@open-nav-charts/object-storage";

export interface ChartArchiverOptions {
  readonly client: AisWebClient;
  readonly storage: ChartStorage;
}

export type ArchiveOutcome =
  | { readonly status: "archived"; readonly key: string }
  | { readonly status: "already-present"; readonly key: string }
  | { readonly status: "failed"; readonly reason: string };

/**
 * Baixa e arquiva o documento de uma carta. A chave determinística é o que
 * torna o upload idempotente e permite pular o download do que já existe
 * (FR-016, FR-017, FR-018).
 */
export class ChartArchiver {
  private readonly client: AisWebClient;
  private readonly storage: ChartStorage;

  constructor(options: ChartArchiverOptions) {
    this.client = options.client;
    this.storage = options.storage;
  }

  buildKey(chart: ChartSummary): string {
    return this.storage.buildKey(chart.airportIcao, chart.id);
  }

  async archive(chart: ChartSummary, signal: AbortSignal): Promise<ArchiveOutcome> {
    signal.throwIfAborted();
    const key = this.buildKey(chart);

    if (await this.storage.exists(key)) {
      return { status: "already-present", key };
    }

    try {
      const content = await this.client.downloadChart(chart);
      await this.storage.put(key, content);
      return { status: "archived", key };
    } catch (error) {
      // Falha de rede é do aeródromo inteiro e merece nova tentativa; PDF
      // inválido é definitivo para esta carta e não derruba as demais (FR-019).
      if (isRetryableSourceError(error)) {
        throw error;
      }
      return {
        status: "failed",
        reason: `carta ${chart.id}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async remove(icao: string, procedureId: string): Promise<void> {
    await this.storage.delete(this.storage.buildKey(icao, procedureId));
  }
}
