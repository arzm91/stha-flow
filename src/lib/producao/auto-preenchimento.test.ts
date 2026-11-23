import { describe, it, expect } from "vitest";
import { acumuladoTotalizador, consumoMp, consumoBaseIndice } from "./auto-preenchimento";

const tot = [{ t: 0, v: 100 }, { t: 10, v: 110 }, { t: 20, v: 130 }, { t: 30, v: 160 }];
const id = [{ t: 0, v: 0 }, { t: 15, v: 1 }];

describe("auto-preenchimento", () => {
  it("acumula só quando a tag do produto está no valor de ativação", () => {
    expect(acumuladoTotalizador(tot, id, 0)).toBe(30);
    expect(acumuladoTotalizador(tot, id, 1)).toBe(30);
  });
  it("sem tag de identificação soma tudo", () => {
    expect(acumuladoTotalizador(tot)).toBe(60);
  });
  it("aplica o fator de escala no consumo", () => {
    expect(consumoMp(tot, "totalizador", 1000)).toBe(60000);
  });
  it("índice usa apenas a primeira matéria-prima", () => {
    expect(consumoBaseIndice([{ qtd: "630" }, { qtd: "200" }])).toBe(630);
  });
});
