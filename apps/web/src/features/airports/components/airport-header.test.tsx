import { describe, expect, it } from "vitest";
import { messages } from "../../../shared/i18n/messages.js";
import {
  airportDetailWithoutRunways,
  completeAirportDetail,
} from "../../../shared/testing/api-fixtures.js";
import { render, screen } from "../../../shared/testing/render.js";
import { AirportHeader } from "./airport-header.js";

describe("AirportHeader", () => {
  it("exibe código, nome e localidade", () => {
    render(<AirportHeader airport={completeAirportDetail} />);

    expect(screen.getByRole("heading", { name: "SBGL" })).toBeInTheDocument();
    expect(screen.getByText("Rio de Janeiro / Galeão")).toBeInTheDocument();
    expect(screen.getByText("Rio de Janeiro, RJ, BR")).toBeInTheDocument();
  });

  it("exibe as coordenadas quando o par está completo", () => {
    render(<AirportHeader airport={completeAirportDetail} />);

    expect(screen.getByText(/-22\.8100, -43\.2506/)).toBeInTheDocument();
  });

  it("lista as pistas com seus designadores", () => {
    render(<AirportHeader airport={completeAirportDetail} />);

    expect(screen.getByText("10/28")).toBeInTheDocument();
    expect(screen.getByText("15/33")).toBeInTheDocument();
  });

  /** FR-023: a pista continua listada, só a medida ausente some. */
  it("omite apenas a medida nula, mantendo a pista", () => {
    render(<AirportHeader airport={completeAirportDetail} />);

    // A primeira pista tem largura; a segunda tem `widthMeters: null`.
    expect(screen.getByText(/Width: 45 m/)).toBeInTheDocument();
    expect(screen.getByText("15/33")).toBeInTheDocument();
    expect(screen.getAllByText(/Width:/)).toHaveLength(1);
  });

  it("avisa quando não há pistas em vez de deixar a área vazia", () => {
    render(<AirportHeader airport={airportDetailWithoutRunways} />);

    expect(screen.getByText(messages.airport.noRunways)).toBeInTheDocument();
  });

  it("não exibe localidade nem coordenadas quando todos os campos são nulos", () => {
    render(<AirportHeader airport={airportDetailWithoutRunways} />);

    expect(screen.queryByText(/Coordinates/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SBXX" })).toBeInTheDocument();
  });

  it("não mostra representações internas de valor vazio", () => {
    render(<AirportHeader airport={airportDetailWithoutRunways} />);

    const text = screen.getByRole("heading", { name: "SBXX" }).closest("div")?.textContent ?? "";
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });
});
