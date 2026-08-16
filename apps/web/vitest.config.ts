import react from "@vitejs/plugin-react";
import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared.js";

export default mergeConfig(
  shared,
  defineConfig({
    plugins: [react()],
    test: {
      // A base do workspace usa `node`; componentes precisam de DOM.
      environment: "jsdom",
      // A base cobre apenas `*.test.ts`; aqui há também `*.test.tsx`.
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      // Instala os stubs de matchMedia e ResizeObserver. Sem isso todo teste que
      // renderiza sob MantineProvider falha (research R5).
      setupFiles: ["./src/shared/testing/setup-tests.ts"],
      coverage: {
        include: ["src/**/*.ts", "src/**/*.tsx"],
        exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/shared/testing/**"],
      },
    },
  }),
);
