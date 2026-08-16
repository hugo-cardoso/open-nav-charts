import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AirportSummary } from "../../../shared/api/types.js";
import { messages } from "../../../shared/i18n/messages.js";
import { airportWithoutLocation, completeAirport } from "../../../shared/testing/api-fixtures.js";
import { render, screen } from "../../../shared/testing/render.js";
import { IcaoAutocomplete } from "./icao-autocomplete.js";

const baseProps = {
  value: "SB",
  onChange: vi.fn(),
  onSelect: vi.fn(),
  suggestions: [] as readonly AirportSummary[],
  isLoading: false,
  isEnabled: true,
};

/**
 * As opções só ficam acessíveis a consultas por papel depois que o dropdown
 * abre — daí `openList`, que reproduz o clique do usuário no campo.
 */
const field = () => screen.getByRole("combobox", { name: messages.search.fieldLabel });

async function openList(): Promise<void> {
  await userEvent.click(field());
}

describe("IcaoAutocomplete", () => {
  /** SC-007: `placeholder` não é rótulo. */
  it("associa um rótulo ao campo", () => {
    render(<IcaoAutocomplete {...baseProps} />);

    expect(field()).toBeInTheDocument();
  });

  it("lista as sugestões com código, nome e localidade", async () => {
    render(<IcaoAutocomplete {...baseProps} suggestions={[completeAirport]} />);
    await openList();

    expect(screen.getByText(completeAirport.icao)).toBeInTheDocument();
    expect(screen.getByText(completeAirport.name)).toBeInTheDocument();
    expect(screen.getByText("Rio de Janeiro, RJ, BR")).toBeInTheDocument();
  });

  /** FR-023: nada de rótulo órfão quando a localidade é inteiramente nula. */
  it("omite a localidade ausente sem deixar vestígio", async () => {
    render(<IcaoAutocomplete {...baseProps} suggestions={[airportWithoutLocation]} />);
    await openList();

    const option = screen.getByRole("option");
    expect(option).toHaveTextContent(airportWithoutLocation.icao);
    expect(option.textContent).not.toContain("null");
    expect(option.textContent).not.toContain("undefined");
  });

  it("devolve o aeródromo escolhido, não apenas o código", async () => {
    const onSelect = vi.fn();
    render(<IcaoAutocomplete {...baseProps} suggestions={[completeAirport]} onSelect={onSelect} />);

    await openList();
    await userEvent.click(screen.getByRole("option"));

    expect(onSelect).toHaveBeenCalledWith(completeAirport);
  });

  /** SC-007: a escolha precisa ser possível sem o mouse. */
  it("permite escolher uma sugestão pelo teclado", async () => {
    const onSelect = vi.fn();
    render(<IcaoAutocomplete {...baseProps} suggestions={[completeAirport]} onSelect={onSelect} />);

    await openList();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledWith(completeAirport);
  });

  it("informa cada alteração do termo", async () => {
    const onChange = vi.fn();
    render(<IcaoAutocomplete {...baseProps} value="" onChange={onChange} />);

    await userEvent.type(field(), "S");

    expect(onChange).toHaveBeenCalledWith("S");
  });

  it("sinaliza a espera enquanto consulta", async () => {
    render(<IcaoAutocomplete {...baseProps} isLoading />);
    await openList();

    expect(screen.getByText(messages.search.loadingLabel)).toBeInTheDocument();
  });

  it("informa quando nenhum aeródromo casa com o código", async () => {
    render(<IcaoAutocomplete {...baseProps} suggestions={[]} />);
    await openList();

    expect(screen.getByText(messages.search.emptyTitle)).toBeInTheDocument();
  });

  it("exibe o erro de validação junto ao campo", () => {
    render(
      <IcaoAutocomplete
        {...baseProps}
        error="Search terms must be between 1 and 100 characters."
      />,
    );

    expect(field()).toHaveAccessibleDescription(/Search terms must be/);
  });

  /** Com menos de duas letras não há o que sugerir; a lista fica fechada. */
  it("mantém a lista oculta enquanto o termo é curto demais", () => {
    render(<IcaoAutocomplete {...baseProps} value="S" isEnabled={false} />);

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
