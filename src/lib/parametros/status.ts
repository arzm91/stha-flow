// Regras dos Parâmetros da Unidade: cálculo do set e status (abaixo/ideal/dentro/acima).
import { compileFormula } from "@/lib/tags/calc";

export type ParamStatus = "abaixo" | "ideal" | "dentro" | "acima" | "sem_dado";

/** variaveis: { t1: "NOME_TAG", K1: 1000 } — strings = tags, números = constantes. */
export function calcularSet(
  formula: string,
  variaveis: Record<string, string | number>,
  tagValue: (nome: string) => number | null,
): number | null {
  try {
    const { expr, vars } = compileFormula(formula);
    const scope: Record<string, number> = {};
    for (const v of vars) {
      const ref = variaveis[v];
      if (ref === undefined) return null;
      const n = typeof ref === "number" ? ref : tagValue(ref);
      if (n === null || !Number.isFinite(n)) return null;
      scope[v] = n;
    }
    const r = Number(expr.evaluate(scope));
    return Number.isFinite(r) ? r : null;
  } catch {
    return null;
  }
}

/** Margens: modo "abs" = valores fixos; "pct" = percentual em torno do set. */
export function calcularLimites(
  set: number | null,
  modo: string,
  min: number | null,
  max: number | null,
): { min: number | null; max: number | null } {
  if (modo === "pct") {
    if (set === null) return { min: null, max: null };
    const a = Math.abs(set);
    return {
      min: min === null ? null : set - (a * min) / 100,
      max: max === null ? null : set + (a * max) / 100,
    };
  }
  return { min, max };
}

/** tolerancia = % em torno do set considerado "ideal". */
export function calcularStatus(
  valor: number | null,
  set: number | null,
  lim: { min: number | null; max: number | null },
  toleranciaPct: number | null,
): ParamStatus {
  if (valor === null || !Number.isFinite(valor)) return "sem_dado";
  if (lim.min !== null && valor < lim.min) return "abaixo";
  if (lim.max !== null && valor > lim.max) return "acima";
  if (set !== null && toleranciaPct !== null) {
    return Math.abs(valor - set) <= (Math.abs(set) * toleranciaPct) / 100 ? "ideal" : "dentro";
  }
  return "ideal";
}
