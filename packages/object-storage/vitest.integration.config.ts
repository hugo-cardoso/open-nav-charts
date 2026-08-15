import { defineConfig } from "vitest/config";

/**
 * Testes de integração exigem Docker e ficam fora do `pnpm test` padrão,
 * que precisa rodar sem rede nem contêineres (research R9). A config é
 * independente da compartilhada: `mergeConfig` concatenaria os `include` e
 * arrastaria os unitários para cá.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.integration.test.ts"],
    passWithNoTests: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Contêineres compartilhados por arquivo não toleram execução paralela.
    fileParallelism: false,
  },
});
