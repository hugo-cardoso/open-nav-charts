import { defineConfig } from "vitest/config";

/**
 * Configuração base de testes herdada por todos os pacotes do workspace.
 * Pacotes fazem merge desta base e sobrescrevem apenas o que for específico.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "html"],
    },
  },
});
