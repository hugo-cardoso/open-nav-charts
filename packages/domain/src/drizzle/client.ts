import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type {
  AirportProcedureRepository,
  AirportRepository,
  AirportSyncRepository,
} from "../repositories/index.js";
import { DrizzleAirportProcedureRepository } from "./airport-procedure-repository.js";
import { DrizzleAirportRepository } from "./airport-repository.js";
import { DrizzleAirportSyncRepository } from "./airport-sync-repository.js";
import * as schema from "./schema.js";

export interface DatabaseConfig {
  readonly url: string;
  readonly maxConnections?: number;
  /**
   * Notificado quando uma conexão ociosa do pool falha (por exemplo, o servidor
   * foi reiniciado). O pool se recupera sozinho; isto existe só para o chamador
   * registrar a ocorrência.
   */
  readonly onPoolError?: (error: Error) => void;
}

export interface Database {
  readonly airports: AirportRepository;
  readonly procedures: AirportProcedureRepository;
  readonly sync: AirportSyncRepository;
  /**
   * Verificação de conectividade para o indicador de saúde. Rejeita quando o
   * banco não responde; existe para que o consumidor não precise emitir SQL —
   * o driver não vaza deste pacote.
   */
  ping(): Promise<void>;
  close(): Promise<void>;
}

export type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Pasta das migrações SQL versionadas, resolvida a partir deste módulo para
 * funcionar tanto de `src` quanto de `dist`.
 */
const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Cria o pool. O chamador é dono do ciclo de vida — sem singleton de módulo
 * (Princípio III). Duas chamadas produzem dois pools independentes.
 */
export function createDatabase(config: DatabaseConfig): Database {
  const pool = new pg.Pool({
    connectionString: config.url,
    ...(config.maxConnections === undefined ? {} : { max: config.maxConnections }),
  });

  // Sem este listener, uma conexão ociosa derrubada pelo servidor — reinício do
  // PostgreSQL, `terminating connection due to administrator command` — emite um
  // `error` não tratado no pool e mata o processo inteiro. Um serviço de longa
  // duração precisa sobreviver a isso e voltar a responder quando o banco
  // retornar; o pool descarta a conexão quebrada e abre outra na próxima query.
  pool.on("error", (error) => {
    config.onPoolError?.(error);
  });

  const db = drizzle(pool, { schema });

  return {
    airports: new DrizzleAirportRepository(db),
    procedures: new DrizzleAirportProcedureRepository(db),
    sync: new DrizzleAirportSyncRepository(db),
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => pool.end(),
  };
}

/** Aplica as migrações pendentes. Idempotente (FR-032). */
export async function runMigrations(config: DatabaseConfig): Promise<void> {
  const pool = new pg.Pool({ connectionString: config.url, max: 1 });
  try {
    await migrate(drizzle(pool, { schema }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
