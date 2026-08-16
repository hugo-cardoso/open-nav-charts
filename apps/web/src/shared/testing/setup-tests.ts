import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * A configuração compartilhada do monorepo não usa `globals`, então o cleanup
 * automático do Testing Library não é registrado. Sem isto, cada render fica no
 * documento e consultas por papel encontram elementos de testes anteriores.
 */
afterEach(() => {
  cleanup();
});

/**
 * A URL da API é validada de forma estrita na inicialização — comportamento
 * desejado em produção, onde a ausência da variável precisa falhar alto. Nos
 * testes, define-se um valor fixo para que a validação não derrube a suíte; as
 * requisições são sempre stubbadas, então o endereço nunca é alcançado.
 */
if (import.meta.env.VITE_API_BASE_URL === undefined) {
  import.meta.env.VITE_API_BASE_URL = "http://api.test";
}

/**
 * jsdom não implementa `matchMedia`, mas o `MantineProvider` o chama na montagem
 * para resolver o esquema de cores. Sem este stub, TODO teste que renderiza um
 * componente falha com `TypeError: window.matchMedia is not a function`
 * (research R5) — não é caso de borda, é pré-requisito da suíte.
 */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    // APIs legadas: componentes de terceiros ainda as usam.
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }),
});

/** Componentes de layout responsivo do Mantine dependem de ResizeObserver. */
window.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

/**
 * `scrollIntoView` não existe em jsdom e é chamado por componentes de lista ao
 * mover o foco pelo teclado.
 */
window.HTMLElement.prototype.scrollIntoView = vi.fn();
