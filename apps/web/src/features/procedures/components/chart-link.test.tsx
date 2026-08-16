import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../../shared/i18n/messages.js";
import { procedureWithChart, procedureWithoutChart } from "../../../shared/testing/api-fixtures.js";
import { render, screen } from "../../../shared/testing/render.js";
import { ChartLink } from "./chart-link.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChartLink com carta disponível", () => {
  it("renderiza um link real, não um botão", () => {
    render(<ChartLink icao="SBGL" procedure={procedureWithChart} />);

    const link = screen.getByRole("link", {
      name: messages.procedures.openChartFor(procedureWithChart.name),
    });
    expect(link.tagName).toBe("A");
  });

  it("aponta para a rota de carta da API", () => {
    render(<ChartLink icao="SBGL" procedure={procedureWithChart} />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      expect.stringContaining("/v1/airports/SBGL/procedures/12345/chart"),
    );
  });

  /** Nova aba preserva o painel de busca já carregado (FR-016). */
  it("abre em nova aba com rel de segurança", () => {
    render(<ChartLink icao="SBGL" procedure={procedureWithChart} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  /**
   * Prova de FR-017: a URL assinada vive 300 s. Se renderizar a lista já
   * disparasse a requisição, o relógio começaria antes do clique e uma carta
   * aberta minutos depois viria expirada.
   */
  it("não dispara requisição ao renderizar", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<ChartLink icao="SBGL" procedure={procedureWithChart} />);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("ChartLink sem carta", () => {
  /** FR-015: nem link, nem botão desabilitado — a indisponibilidade é textual. */
  it("não oferece nenhum controle de abertura", () => {
    render(<ChartLink icao="SBGL" procedure={procedureWithoutChart} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("informa que a carta não está disponível", () => {
    render(<ChartLink icao="SBGL" procedure={procedureWithoutChart} />);

    expect(screen.getByText(messages.procedures.noChart)).toBeInTheDocument();
  });
});
