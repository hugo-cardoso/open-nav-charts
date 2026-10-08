import { eq, sql } from "drizzle-orm";
import type {
  SourceSyncState,
  SourceSyncStateRepository,
  SourceSyncValue,
} from "../repositories/index.js";
import type { DrizzleClient } from "./client.js";
import { sourceSyncState } from "./schema.js";

export class DrizzleSourceSyncStateRepository implements SourceSyncStateRepository {
  private readonly db: DrizzleClient;

  constructor(db: DrizzleClient) {
    this.db = db;
  }

  async find(source: string): Promise<SourceSyncState | null> {
    const rows = await this.db
      .select()
      .from(sourceSyncState)
      .where(eq(sourceSyncState.source, source))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toState(row);
  }

  /**
   * `observed_at` só é substituído quando o par muda: é a comparação com ele que
   * mantém pendente quem ficou para trás numa execução interrompida.
   * `IS NOT DISTINCT FROM` porque `null` repetido não é mudança.
   */
  async observe(source: string, value: SourceSyncValue, at: Date): Promise<SourceSyncState> {
    const rows = await this.db
      .insert(sourceSyncState)
      .values({
        source,
        lastUpdate: value.lastUpdate,
        airacCycle: value.airacCycle,
        observedAt: at,
      })
      .onConflictDoUpdate({
        target: sourceSyncState.source,
        set: {
          observedAt: sql`case
            when ${sourceSyncState.lastUpdate} is not distinct from excluded.last_update
             and ${sourceSyncState.airacCycle} is not distinct from excluded.airac_cycle
            then ${sourceSyncState.observedAt}
            else excluded.observed_at
          end`,
          lastUpdate: sql`excluded.last_update`,
          airacCycle: sql`excluded.airac_cycle`,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    const row = rows[0];
    if (row === undefined) {
      throw new Error(`falha ao registrar o estado da fonte ${source}`);
    }
    return toState(row);
  }
}

function toState(row: typeof sourceSyncState.$inferSelect): SourceSyncState {
  return {
    source: row.source,
    lastUpdate: row.lastUpdate,
    airacCycle: row.airacCycle,
    observedAt: row.observedAt,
  };
}
