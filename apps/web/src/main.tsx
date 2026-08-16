// A folha do Mantine vem antes de qualquer estilo próprio: a ordem de importação
// define a precedência das camadas de CSS.
import "@mantine/core/styles.css";

import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./app.js";
import { theme } from "./shared/theme/theme.js";

/**
 * Cache apenas de memória, descartado ao recarregar a página. `staleTime` de um
 * minuto faz o retorno da tela do aeródromo para a busca ser instantâneo
 * (FR-011) sem servir dados antigos por tempo demais.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // A API limita a 120 requisições por minuto; repetir sem limite agravaria
      // um `429` em vez de resolvê-lo.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Elemento #root não encontrado em index.html");
}

createRoot(container).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
