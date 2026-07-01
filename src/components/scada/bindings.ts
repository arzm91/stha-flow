import type { Bindings, ColorRange } from "./types";

export type TagLive = {
  nome: string;
  valor: string | null;
  valor_num: number | null;
  unidade: string | null;
};

export type AlertaCfg = {
  tag_nome: string;
  min_val: number | null;
  max_val: number | null;
};

export type EvaluatedBindings = {
  levelPct: number | null;          // 0..1
  value: { text: string; unit: string } | null;
  color: string | null;              // hex/oklch
  on: boolean;                        // animação/rotação ativa
  alarm: "ok" | "warn" | "alert" | "none";
};

export function evalRange(v: number, r: ColorRange): boolean {
  if (r.op === "<") return v < r.a;
  if (r.op === ">") return v > r.a;
  return r.b != null && v >= r.a && v <= r.b;
}

export function evaluateBindings(
  b: Bindings | undefined,
  tags: Map<string, TagLive>,
  alertas: Map<string, AlertaCfg>,
): EvaluatedBindings {
  const out: EvaluatedBindings = {
    levelPct: null, value: null, color: null, on: false, alarm: "none",
  };
  if (!b) return out;

  if (b.level) {
    const t = tags.get(b.level.tag);
    if (t?.valor_num != null) {
      const span = Math.max(1e-9, b.level.max - b.level.min);
      out.levelPct = Math.max(0, Math.min(1, (t.valor_num - b.level.min) / span));
    }
  }
  if (b.value) {
    const t = tags.get(b.value.tag);
    if (t) {
      const num = t.valor_num;
      const text = num != null
        ? num.toLocaleString("pt-BR", { maximumFractionDigits: b.value.decimals, minimumFractionDigits: b.value.decimals })
        : (t.valor ?? "—");
      out.value = { text, unit: b.value.showUnit ? (t.unidade ?? "") : "" };
    }
  }
  if (b.color) {
    const t = tags.get(b.color.tag);
    if (t?.valor_num != null) {
      const hit = b.color.ranges.find((r) => evalRange(t.valor_num!, r));
      if (hit) out.color = hit.color;
    }
  }
  if (b.onOff) {
    const t = tags.get(b.onOff.tag);
    if (t?.valor_num != null) out.on = t.valor_num >= b.onOff.threshold;
  }
  // alarme por faixa cadastrada
  const alertaTag = b.value?.tag ?? b.level?.tag ?? b.color?.tag;
  if (alertaTag) {
    const al = alertas.get(alertaTag);
    const t = tags.get(alertaTag);
    if (al && t?.valor_num != null) {
      const under = al.min_val != null && t.valor_num < al.min_val;
      const over = al.max_val != null && t.valor_num > al.max_val;
      out.alarm = under || over ? "alert" : "ok";
    } else if (t?.valor_num != null) {
      out.alarm = "ok";
    } else if (alertaTag) {
      out.alarm = "warn";
    }
  }
  return out;
}
