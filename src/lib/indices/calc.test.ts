import { describe, it, expect } from "vitest";
import { calcularIndice } from "./calc";

const tags: Record<string, number> = { INDICE: 0.65, CONC_ONLINE: 55 };
const tv = (n: string) => tags[n];

describe("calcularIndice", () => {
  it("corrige índice de 55% para a concentração do produto (50%)", () => {
    const r = calcularIndice({ nome: "x", tag: "INDICE", formula: "VALOR * CONC_PROD / 55", unidade: "", decimais: 3 }, tv, 50);
    expect(r).toBeCloseTo(0.5909, 4);
  });
  it("usa tag de concentração de momento na fórmula", () => {
    const r = calcularIndice({ nome: "x", tag: "INDICE", formula: "VALOR * CONC_PROD / CONC_ONLINE", unidade: "", decimais: 3 }, tv, 50);
    expect(r).toBeCloseTo(0.5909, 4);
  });
  it("sem fórmula devolve o valor direto da tag", () => {
    expect(calcularIndice({ nome: "x", tag: "INDICE", formula: "", unidade: "", decimais: 3 }, tv, 50)).toBe(0.65);
  });
  it("sem concentração do produto não calcula", () => {
    expect(calcularIndice({ nome: "x", tag: "INDICE", formula: "VALOR * CONC_PROD / 55", unidade: "", decimais: 3 }, tv, null)).toBeNull();
  });
});
