import { compileFormula } from "@/lib/tags/calc";

export type IndiceConfig = {
  nome: string;
  tag: string;
  formula: string;
  unidade: string;
  decimais: number;
};

/** Variável especial com a concentração (%) do produto em produção. */
export const CONC_VAR = "CONC_PROD";
/** Variável especial com o valor da tag base do índice. */
export const VALOR_VAR = "VALOR";

/**
 * Calcula o índice corrigido. Sem fórmula, devolve o valor da tag base.
 * Na fórmula: VALOR = tag base, CONC_PROD = concentração do produto, outras tags pelo nome, números como constantes.
 */
export function calcularIndice(
  cfg: IndiceConfig,
  tagValue: (nome: string) => number | null | undefined,
  concProduto: number | null | undefined,
): number | null {
  const base = cfg.tag ? tagValue(cfg.tag) : null;
  const f = cfg.formula?.trim();
  if (!f) return base ?? null;
  try {
    const { expr, vars } = compileFormula(f);
    const scope: Record<string, number> = {};
    for (const v of vars) {
      let val: number | null | undefined;
      if (v === VALOR_VAR) val = base;
      else if (v === CONC_VAR) val = concProduto;
      else val = tagValue(v);
      if (val === null || val === undefined || !Number.isFinite(Number(val))) return null;
      scope[v] = Number(val);
    }
    const r = Number(expr.evaluate(scope));
    return Number.isFinite(r) ? r : null;
  } catch {
    return null;
  }
}

export function parseIndices(raw: unknown): IndiceConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    const o = (x ?? {}) as Partial<IndiceConfig>;
    return { nome: o.nome ?? "", tag: o.tag ?? "", formula: o.formula ?? "", unidade: o.unidade ?? "", decimais: Number(o.decimais ?? 3) };
  });
}
