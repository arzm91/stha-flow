import { describe, it, expect } from "vitest";
import { incrementoVazao } from "./totalizador-vazao";

describe("incrementoVazao", () => {
  it("500 kg/h durante 1 minuto soma 8,333 kg", () => {
    expect(incrementoVazao(500, 500, 60_000, "h")).toBeCloseTo(8.3333, 3);
  });
  it("500 kg/h por 24h de ticks de 1 min soma 12.000 kg", () => {
    let s = 0;
    for (let i = 0; i < 1440; i++) s += incrementoVazao(500, 500, 60_000, "h");
    expect(s).toBeCloseTo(12000, 6);
  });
  it("usa média entre leituras (trapézio)", () => {
    expect(incrementoVazao(400, 600, 3_600_000 / 6, "h")).toBeCloseTo(500 / 6, 6);
  });
  it("lacuna acima de 15 min não soma", () => {
    expect(incrementoVazao(500, 500, 16 * 60_000, "h")).toBe(0);
  });
});
