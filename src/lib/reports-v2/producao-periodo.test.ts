import { describe, it, expect } from "vitest";
import { indiceConversao, sobreposicaoSeg, disponibilidade } from "./producao-periodo";

describe("relatório de produção por período", () => {
  it("índice = consumido / produzido", () => {
    expect(indiceConversao(630, 1000)).toBeCloseTo(0.63);
    expect(indiceConversao(10, 0)).toBeNull();
  });
  it("parada só conta dentro do período", () => {
    expect(sobreposicaoSeg(0, 10_000, 5_000, 20_000)).toBe(5);
  });
  it("disponibilidade 90% com 1h parada em 10h", () => {
    expect(disponibilidade(36000, 3600)).toBeCloseTo(90);
  });
});

import { indiceCorrigido } from "./producao-periodo";
describe("indiceCorrigido", () => {
  it("consumido/produzido × conc_prod/conc_média", () => {
    expect(indiceCorrigido(630, 1000, 50, 52)).toBeCloseTo(0.6058, 4);
  });
  it("sem concentração média usa índice direto", () => {
    expect(indiceCorrigido(630, 1000, 50, null)).toBeCloseTo(0.63);
  });
  it("produção zero retorna nulo", () => {
    expect(indiceCorrigido(630, 0, 50, 52)).toBeNull();
  });
});
