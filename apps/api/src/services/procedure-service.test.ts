import { describe, expect, it } from "vitest";
import { AirportNotFoundError } from "../http/api-error.js";
import {
  airport,
  FakeAirportProcedureRepository,
  FakeAirportRepository,
  procedure,
} from "../testing/doubles.js";
import { ProcedureService } from "./procedure-service.js";

function service(options: {
  airports?: readonly ReturnType<typeof airport>[];
  procedures?: readonly ReturnType<typeof procedure>[];
}): ProcedureService {
  return new ProcedureService({
    airports: new FakeAirportRepository(options.airports ?? []),
    procedures: new FakeAirportProcedureRepository(options.procedures ?? []),
  });
}

describe("ProcedureService.listByAirport", () => {
  it("lista os procedimentos do aeródromo", async () => {
    const found = await service({
      airports: [airport({ icao: "SBGL" })],
      procedures: [procedure({ id: "p1" }), procedure({ id: "p2" })],
    }).listByAirport({ icao: "SBGL" });

    expect(found.map((item) => item.id)).toEqual(["p1", "p2"]);
  });

  it("distingue aeródromo inexistente de aeródromo sem procedimentos (FR-016)", async () => {
    const semProcedimentos = service({ airports: [airport({ icao: "SBGL" })] });
    const inexistente = service({ airports: [] });

    // Existe e não tem cartas: lista vazia, não erro.
    expect(await semProcedimentos.listByAirport({ icao: "SBGL" })).toEqual([]);
    // Não existe: erro, para o consumidor não confundir os dois casos.
    await expect(inexistente.listByAirport({ icao: "SBXX" })).rejects.toThrow(AirportNotFoundError);
  });

  it("normaliza o ICAO para maiúsculas", async () => {
    const found = await service({
      airports: [airport({ icao: "SBGL" })],
      procedures: [procedure({ id: "p1" })],
    }).listByAirport({ icao: "sbgl" });

    expect(found).toHaveLength(1);
  });

  it("filtra por tipo, insensível a caixa (FR-015)", async () => {
    const subject = service({
      airports: [airport({ icao: "SBGL" })],
      procedures: [
        procedure({ id: "p1", type: "IAC" }),
        procedure({ id: "p2", type: "SID" }),
        procedure({ id: "p3", type: "IAC" }),
      ],
    });

    expect((await subject.listByAirport({ icao: "SBGL", type: "iac" })).map((i) => i.id)).toEqual([
      "p1",
      "p3",
    ]);
    expect((await subject.listByAirport({ icao: "SBGL", type: "SID" })).map((i) => i.id)).toEqual([
      "p2",
    ]);
  });

  it("devolve lista vazia quando nenhum procedimento é do tipo pedido", async () => {
    const found = await service({
      airports: [airport({ icao: "SBGL" })],
      procedures: [procedure({ id: "p1", type: "IAC" })],
    }).listByAirport({ icao: "SBGL", type: "STAR" });

    expect(found).toEqual([]);
  });

  it("não devolve procedimento de outro aeródromo", async () => {
    const found = await service({
      airports: [airport({ icao: "SBGL" }), airport({ icao: "SBSP" })],
      procedures: [
        procedure({ id: "p1", airportIcao: "SBGL" }),
        procedure({ id: "p2", airportIcao: "SBSP" }),
      ],
    }).listByAirport({ icao: "SBGL" });

    expect(found.map((item) => item.id)).toEqual(["p1"]);
  });
});
