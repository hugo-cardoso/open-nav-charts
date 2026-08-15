import { fileURLToPath } from "node:url";
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
}

export interface Database {
  readonly airports: AirportRepository;
  readonly procedures: AirportProcedureRepository;
  readonly sync: AirportSyncRepository;
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
  const db = drizzle(pool, { schema });

  return {
    airports: new DrizzleAirportRepository(db),
    procedures: new DrizzleAirportProcedureRepository(db),
    sync: new DrizzleAirportSyncRepository(db),
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
