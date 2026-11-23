import { describe, it, expect } from "vitest";
import { somaIncrementos } from "./producao-24h";
describe("somaIncrementos", () => {
  it("soma só os aumentos e ignora reset do totalizador", () => {
    expect(somaIncrementos([100, 150, 200, 0, 30])).toBe(130);
  });
});
