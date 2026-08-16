import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render as testingLibraryRender } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { theme } from "../../shared/theme/theme.js";

/**
 * Render com todos os provedores já montados. Os testes MUST usar esta função em
 * vez do `render` cru: sem `MantineProvider` os componentes quebram, e montar o
 * contexto em cada arquivo repetiria a mesma configuração por toda a suíte.
 */

export interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  /** Entrada inicial do roteador de memória. */
  readonly route?: string;
  /** Padrão de rota, quando o componente lê parâmetros de caminho. */
  readonly path?: string;
}

/**
 * Repetição desativada: um teste de estado de erro não deve esperar por
 * tentativas automáticas, e o silêncio do log evita ruído esperado no console.
 */
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): ReturnType<typeof testingLibraryRender> {
  const { route = "/", path, ...renderOptions } = options;
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <MantineProvider theme={theme} env="test">
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            {path === undefined ? (
              children
            ) : (
              <Routes>
                <Route path={path} element={children} />
              </Routes>
            )}
          </MemoryRouter>
        </QueryClientProvider>
      </MantineProvider>
    );
  }

  return testingLibraryRender(ui, { wrapper: Wrapper, ...renderOptions });
}

export * from "@testing-library/react";
export { renderWithProviders as render };
