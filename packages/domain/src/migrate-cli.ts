#!/usr/bin/env node
import { runMigrations } from "./drizzle/client.js";

/**
 * Aplica as migrações pendentes. Idempotente (FR-032). A rotina também as
 * aplica na inicialização; este comando existe para preparar o banco sem coletar.
 */
const url = process.env.DATABASE_URL;
if (url === undefined || url.trim() === "") {
  process.stderr.write("DATABASE_URL é obrigatória para aplicar as migrações.\n");
  process.exit(2);
}

await runMigrations({ url });
process.stdout.write("Migrações aplicadas.\n");
