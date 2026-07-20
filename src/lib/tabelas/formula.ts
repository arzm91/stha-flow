// Avaliação de fórmulas para colunas calculadas de Tabelas.
// Usa expr-eval (já instalado). Variáveis podem referenciar outras colunas
// (pelo NOME da coluna, convertido em identificador seguro) e tags ao vivo
// (pelo nome exato ou também em versão "slug").
import { Parser } from "expr-eval";

const parser = new Parser({
  operators: {
    add: true, subtract: true, multiply: true, divide: true,
    remainder: true, power: true,
    comparison: true, logical: true, conditional: true,
    concatenate: false, in: false, assignment: false,
  },
});

/**
 * Converte um rótulo em um identificador seguro para uso em fórmulas.
 * Ex.: "Temp. de saída (°C)" -> "temp_de_saida_c".
 * Remove acentos, deixa minúsculo, troca não-alfanuméricos por "_".
 */
export function slugifyVar(label: string): string {
  const noAcc = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let s = noAcc.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) s = "var";
  if (/^[0-9]/.test(s)) s = `_${s}`;
  return s;
}

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
