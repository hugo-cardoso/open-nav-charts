import { defineConfig } from "vitest/config";

/**
 * Testes de integração exigem Docker e ficam fora do `pnpm test` padrão,
 * que precisa rodar sem rede nem contêineres (research R12).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.integration.test.ts"],
    passWithNoTests: true,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
