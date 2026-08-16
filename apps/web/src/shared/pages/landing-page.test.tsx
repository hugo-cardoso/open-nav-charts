import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../shared/i18n/messages.js";
import { LandingPage } from "../../shared/pages/landing-page.js";
import { render, screen } from "../../shared/testing/render.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LandingPage", () => {
  it("apresenta o nome do produto e a descrição do acervo", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(messages.landing.title);
    expect(screen.getByText(messages.landing.description)).toBeInTheDocument();
  });

  it("oferece um acionamento visível para o painel de busca", () => {
    render(<LandingPage />);

    expect(screen.getByRole("link", { name: messages.landing.searchAction })).toHaveAttribute(
      "href",
      "/search",
    );
  });

  /**
   * SC-003 depende disto: a tela inicial fica completa em menos de 3 s em 3G
   * rápido porque não espera por nenhuma resposta da API.
   */
  it("não consulta a API ao carregar", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<LandingPage />);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("define o título do documento", () => {
    render(<LandingPage />);

    expect(document.title).toBe(messages.documentTitle.landing);
  });
});
