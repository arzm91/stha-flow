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
