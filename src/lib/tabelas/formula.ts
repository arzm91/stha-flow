// Avaliação de fórmulas para colunas calculadas de Tabelas.
// Usa expr-eval (já instalado). Variáveis podem referenciar outras colunas (pelo key)
// e tags ao vivo (pelo nome exato).
import { Parser } from "expr-eval";

const parser = new Parser({
  operators: {
    add: true, subtract: true, multiply: true, divide: true,
    remainder: true, power: true,
    comparison: true, logical: true, conditional: true,
    concatenate: false, in: false, assignment: false,
  },
});

export function evalTabelaFormula(
  formula: string,
  scope: Record<string, number>,
): number | null {
  try {
    const expr = parser.parse(formula);
    const vars = expr.variables({ withMembers: false });
    for (const v of vars) {
      const val = scope[v];
      if (val == null || !Number.isFinite(val)) return null;
    }
    const r = Number(expr.evaluate(scope));
    return Number.isFinite(r) ? r : null;
  } catch {
    return null;
  }
}
