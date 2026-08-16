import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { messages } from "../../../shared/i18n/messages.js";
import { render, screen } from "../../../shared/testing/render.js";
import { CountryFilter } from "./country-filter.js";

/** O `Select` do Mantine expõe o input visível como `combobox`. */
const field = () => screen.getByRole("combobox", { name: messages.search.countryLabel });

describe("CountryFilter", () => {
  /** SC-007: `placeholder` não é rótulo. */
  it("associa um rótulo ao campo", () => {
    render(<CountryFilter value="" onChange={vi.fn()} />);

    expect(field()).toBeInTheDocument();
  });

  /**
   * Códigos ISO alpha-2 não são adivinháveis: escolher "Brazil" numa lista é
   * melhor do que lembrar que o código é "BR".
   */
  it("oferece os países por nome, não por código", async () => {
    render(<CountryFilter value="" onChange={vi.fn()} />);

    await userEvent.click(field());

    expect(await screen.findByRole("option", { name: "Brazil" })).toBeInTheDocument();
  });

  it("informa o código ISO ao escolher um país pelo nome", async () => {
    const onChange = vi.fn();
    render(<CountryFilter value="" onChange={onChange} />);

    await userEvent.click(field());
    await userEvent.click(await screen.findByRole("option", { name: "Brazil" }));

    expect(onChange).toHaveBeenCalledWith("BR");
  });

  it("exibe o nome do país já selecionado", () => {
    render(<CountryFilter value="BR" onChange={vi.fn()} />);

    expect(field()).toHaveValue("Brazil");
  });

  it("mostra o placeholder quando nenhum país está escolhido", () => {
    render(<CountryFilter value="" onChange={vi.fn()} />);

    expect(field()).toHaveValue("");
    expect(field()).toHaveAttribute("placeholder", messages.search.countryPlaceholder);
  });

  /** FR-022: o erro pertence ao campo que o causou, não a um alerta global. */
  it("exibe o erro de validação junto ao campo", () => {
    render(
      <CountryFilter
        value="BR"
        onChange={vi.fn()}
        error="Country codes must be exactly 2 letters."
      />,
    );

    expect(field()).toHaveAccessibleDescription(/Country codes must be/);
  });

  /** A busca dentro da lista importa: são doze países e a lista pode crescer. */
  it("permite filtrar a lista digitando", async () => {
    render(<CountryFilter value="" onChange={vi.fn()} />);

    await userEvent.click(field());
    await userEvent.type(field(), "Bra");

    expect(await screen.findByRole("option", { name: "Brazil" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Chile" })).not.toBeInTheDocument();
  });
});
