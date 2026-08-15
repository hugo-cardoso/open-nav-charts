import { describe, expect, it } from "vitest";
import { formatCoordinate } from "./index.js";

describe("formatCoordinate", () => {
  it("formata hemisférios norte e leste", () => {
    expect(formatCoordinate({ latitude: 38.7223, longitude: 9.1393 })).toBe(
      "38.7223° N, 9.1393° E",
    );
  });

  it("formata hemisférios sul e oeste", () => {
    expect(formatCoordinate({ latitude: -22.9068, longitude: -43.1729 })).toBe(
      "22.9068° S, 43.1729° W",
    );
  });

  it("trata a origem como norte e leste", () => {
    expect(formatCoordinate({ latitude: 0, longitude: 0 })).toBe("0.0000° N, 0.0000° E");
  });

  it("respeita o número de casas decimais pedido", () => {
    expect(formatCoordinate({ latitude: 38.7223, longitude: -9.1393 }, 1)).toBe("38.7° N, 9.1° W");
  });

  it("aceita os extremos do intervalo válido", () => {
    expect(formatCoordinate({ latitude: 90, longitude: 180 }, 0)).toBe("90° N, 180° E");
    expect(formatCoordinate({ latitude: -90, longitude: -180 }, 0)).toBe("90° S, 180° W");
  });

  it("rejeita latitude fora do intervalo", () => {
    expect(() => formatCoordinate({ latitude: 90.1, longitude: 0 })).toThrow(RangeError);
  });

  it("rejeita longitude fora do intervalo", () => {
    expect(() => formatCoordinate({ latitude: 0, longitude: -180.1 })).toThrow(RangeError);
  });

  it("rejeita valores não finitos", () => {
    expect(() => formatCoordinate({ latitude: Number.NaN, longitude: 0 })).toThrow(RangeError);
  });
});
