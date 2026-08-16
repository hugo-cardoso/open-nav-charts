import { describe, expect, it } from "vitest";
import type { AirportLocation } from "../../../shared/api/types.js";
import {
  airportWithoutLocation,
  airportWithPartialCoordinates,
  completeAirport,
} from "../../../shared/testing/api-fixtures.js";
import { render, screen } from "../../../shared/testing/render.js";
import { AirportLocationText, formatCoordinates, formatLocation } from "./airport-location.js";

const EMPTY_LOCATION: AirportLocation = {
  city: null,
  state: null,
  country: null,
  latitude: null,
  longitude: null,
};

describe("formatLocation", () => {
  it("une cidade, estado e país presentes", () => {
    expect(formatLocation(completeAirport.location)).toBe("Rio de Janeiro, RJ, BR");
  });

  it("omite as partes nulas sem deixar vírgulas soltas", () => {
    expect(formatLocation({ ...EMPTY_LOCATION, city: "Manaus", country: "BR" })).toBe("Manaus, BR");
  });

  it("devolve nulo quando cidade, estado e país faltam", () => {
    expect(formatLocation(EMPTY_LOCATION)).toBeNull();
  });

  it("ignora partes compostas apenas de espaços", () => {
    expect(formatLocation({ ...EMPTY_LOCATION, city: "   ", state: "RJ" })).toBe("RJ");
  });
});

describe("formatCoordinates", () => {
  it("formata o par completo", () => {
    expect(formatCoordinates(completeAirport.location)).toBe("-22.8100, -43.2506");
  });

  /** Uma coordenada isolada não localiza nada. */
  it("devolve nulo quando apenas uma coordenada está presente", () => {
    expect(formatCoordinates(airportWithPartialCoordinates.location)).toBeNull();
  });

  it("devolve nulo quando ambas faltam", () => {
    expect(formatCoordinates(EMPTY_LOCATION)).toBeNull();
  });
});

describe("AirportLocationText", () => {
  it("renderiza a localidade disponível", () => {
    render(<AirportLocationText location={completeAirport.location} />);

    expect(screen.getByText("Rio de Janeiro, RJ, BR")).toBeInTheDocument();
  });

  /**
   * FR-023: nada de rótulo órfão nem representação interna de vazio. A asserção
   * olha o `<main>` e não o container inteiro porque o `MantineProvider` injeta
   * um `<style>` com o tema, que também conta como texto do container.
   */
  it("não renderiza nada quando a localidade está vazia", () => {
    render(
      <main>
        <AirportLocationText location={airportWithoutLocation.location} />
      </main>,
    );

    const output = screen.getByRole("main").textContent ?? "";
    expect(output).toBe("");
    expect(output).not.toContain("null");
    expect(output).not.toContain("undefined");
  });
});
