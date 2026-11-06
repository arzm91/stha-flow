import { describe, it, expect } from "vitest";
import { calcularSet, calcularLimites, calcularStatus } from "./status";

const tags: Record<string, number> = { "TAG.X": 10, "TAG.Y": 50 };
const tv = (n: string) => tags[n] ?? null;

describe("parâmetros da unidade", () => {
  it("set por fórmula: tagx * tagy / K", () => {
    expect(calcularSet("t1 * t2 / K1", { t1: "TAG.X", t2: "TAG.Y", K1: 1000 }, tv)).toBe(0.5);
  });
  it("set sem dado da tag retorna null", () => {
    expect(calcularSet("t1 * 2", { t1: "NAO_EXISTE" }, tv)).toBeNull();
  });
  it("margem percentual em torno do set", () => {
    expect(calcularLimites(100, "pct", 5, 10)).toEqual({ min: 95, max: 110 });
  });
  it("abaixo do mínimo", () => {
    expect(calcularStatus(90, 100, { min: 95, max: 105 }, null)).toBe("abaixo");
  });
  it("acima do máximo", () => {
    expect(calcularStatus(106, 100, { min: 95, max: 105 }, null)).toBe("acima");
  });
  it("ideal dentro da tolerância, dentro fora dela", () => {
    expect(calcularStatus(101, 100, { min: 95, max: 105 }, 2)).toBe("ideal");
    expect(calcularStatus(104, 100, { min: 95, max: 105 }, 2)).toBe("dentro");
  });
  it("sem leitura não vira zero", () => {
    expect(calcularStatus(null, 100, { min: 95, max: 105 }, null)).toBe("sem_dado");
  });
});
