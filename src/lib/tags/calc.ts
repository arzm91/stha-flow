// Motor de tags calculadas — parser seguro (expr-eval) + resolução em ordem topológica.
import { Parser } from "expr-eval";

export type CalcTag = {
  id: string;
  nome: string;
  nome_amigavel: string | null;
  formula: string | null;
  unidade: string | null;
  grupo: string | null;
  decimais: number;
  valor_min: number | null;
  valor_max: number | null;
  ativo: boolean;
  owner_id: string;
  tipo?: "formula" | "delta_janela" | string | null;
  snapshot_tag_nome?: string | null;
  snapshot_hora?: string | null;
  snapshot_janela_dias?: number | null;
  ultimo_valor_calc?: number | null;
  ultimo_valor_calc_em?: string | null;
};

// Parser configurado com funções matemáticas seguras (sem acesso ao ambiente JS).
const parser = new Parser({
  operators: {
    add: true, subtract: true, multiply: true, divide: true,
    remainder: true, power: true,
    comparison: true, logical: true, conditional: true,
    concatenate: false, in: false, assignment: false,
  },
});

// Retorna a expressão compilada e a lista de variáveis referenciadas.
export function compileFormula(formula: string): { expr: ReturnType<typeof parser.parse>; vars: string[] } {
  const expr = parser.parse(formula);
  const vars = expr.variables({ withMembers: false });
  return { expr, vars };
}

export function validateFormula(formula: string): { ok: true; vars: string[] } | { ok: false; error: string } {
  try {
    const { vars } = compileFormula(formula);
    return { ok: true, vars };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Fórmula inválida" };
  }
}

// Ordena tags calculadas por dependência (topo sort). Detecta ciclos.
export function topoSortCalcTags(tags: CalcTag[]): { order: CalcTag[]; cycles: string[] } {
  const byName = new Map(tags.map((t) => [t.nome, t]));
  const deps = new Map<string, string[]>();
  for (const t of tags) {
    if (t.tipo && t.tipo !== "formula") { deps.set(t.nome, []); continue; }
    try {
      const { vars } = compileFormula(t.formula ?? "");
      deps.set(t.nome, vars.filter((v) => byName.has(v))); // só dependências calculadas
    } catch {
      deps.set(t.nome, []);
    }
  }
  const order: CalcTag[] = [];
  const state = new Map<string, "white" | "gray" | "black">();
  const cycles: string[] = [];
  for (const t of tags) state.set(t.nome, "white");
  const visit = (name: string, path: string[]) => {
    const s = state.get(name);
    if (s === "black") return;
    if (s === "gray") {
      cycles.push([...path, name].join(" → "));
      return;
    }
    state.set(name, "gray");
    for (const d of deps.get(name) ?? []) visit(d, [...path, name]);
    state.set(name, "black");
    const tag = byName.get(name);
    if (tag) order.push(tag);
  };
  for (const t of tags) visit(t.nome, []);
  return { order, cycles };
}

// Avalia todas as tags calculadas ativas com base nos valores atuais.
// values: mapa nome->valor numérico (inclui tags do endpoint e as já calculadas).
export function evaluateCalcTags(
  tags: CalcTag[],
  baseValues: Map<string, number>,
): Map<string, { valor: number | null; erro: string | null }> {
  const { order } = topoSortCalcTags(tags.filter((t) => t.ativo));
  const values = new Map(baseValues);
  const out = new Map<string, { valor: number | null; erro: string | null }>();
  for (const t of order) {
    if (t.tipo && t.tipo !== "formula") continue; // delta_janela é calculado pelo cron server-side
    try {
      const { expr, vars } = compileFormula(t.formula ?? "");
      let missing: string | null = null;
      for (const v of vars) {
        const val = values.get(v);
        if (val == null || !Number.isFinite(val)) {
          missing = v;
          break;
        }
        scope[v] = val;
      }
      if (missing) {
        out.set(t.nome, { valor: null, erro: `Tag "${missing}" sem valor` });
        continue;
      }
      const r = Number(expr.evaluate(scope));
      if (!Number.isFinite(r)) {
        out.set(t.nome, { valor: null, erro: "Resultado inválido" });
        continue;
      }
      values.set(t.nome, r);
      out.set(t.nome, { valor: r, erro: null });
    } catch (e: any) {
      out.set(t.nome, { valor: null, erro: e?.message ?? "Erro na fórmula" });
    }
  }
  return out;
}
