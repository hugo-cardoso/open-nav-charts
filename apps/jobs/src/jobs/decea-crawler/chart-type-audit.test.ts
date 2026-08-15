import { describe, expect, it } from "vitest";
import { ChartTypeAudit } from "./chart-type-audit.js";

const KNOWN = [
  "ADC",
  "AOC",
  "ARC",
  "ATCSMAC",
  "GMC",
  "IAC",
  "LC",
  "OTR",
  "PATC",
  "PDC",
  "SID",
  "STAR",
  "VAC",
] as const;

describe("ChartTypeAudit", () => {
  it("reconhece as 13 siglas da espécie IFR", () => {
    const audit = new ChartTypeAudit();

    for (const type of KNOWN) {
      expect(audit.isUnknown(type)).toBe(false);
    }
  });

  it("sinaliza tipo fora das 13 siglas conhecidas", () => {
    const audit = new ChartTypeAudit();

    expect(audit.isUnknown("XYZ")).toBe(true);
  });

  it("acumula os tipos desconhecidos encontrados", () => {
    const audit = new ChartTypeAudit();

    audit.record("IAC");
    audit.record("NOVO");
    audit.record("OUTRO");

    expect(audit.unknownTypes).toEqual(["NOVO", "OUTRO"]);
  });

  it("não repete o mesmo tipo desconhecido", () => {
    const audit = new ChartTypeAudit();

    audit.record("NOVO");
    audit.record("NOVO");

    expect(audit.unknownTypes).toEqual(["NOVO"]);
  });

  it("acumula a distribuição de tipos da execução", () => {
    const audit = new ChartTypeAudit();

    audit.record("IAC");
    audit.record("IAC");
    audit.record("SID");

    expect(audit.distribution.get("IAC")).toBe(2);
    expect(audit.distribution.get("SID")).toBe(1);
  });

  it("normaliza a sigla para maiúsculo", () => {
    const audit = new ChartTypeAudit();

    audit.record("iac");

    expect(audit.isUnknown("iac")).toBe(false);
    expect(audit.distribution.get("IAC")).toBe(1);
    expect(audit.unknownTypes).toEqual([]);
  });

  it("devolve a distribuição como cópia imutável", () => {
    const audit = new ChartTypeAudit();
    audit.record("IAC");

    (audit.distribution as Map<string, number>).clear();

    expect(audit.distribution.get("IAC")).toBe(1);
  });
});
