// JavaScript por ser um script de build de uma linha executado pelo Node sem
// compilação prévia — exceção prevista no Princípio II.
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// O `tsc` só emite `.ts`; os SQL versionados precisam acompanhar o `dist` para
// que `runMigrations` os encontre pelo mesmo caminho relativo em ambos.
await cp(
  fileURLToPath(new URL("../src/migrations", import.meta.url)),
  fileURLToPath(new URL("../dist/migrations", import.meta.url)),
  { recursive: true },
);
