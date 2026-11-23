/** Regras puras do auto-preenchimento do registro de produção a partir das tags do CLP. */
export type Pt = { t: number; v: number };

/** Valor da tag de identificação vigente no instante t (último ponto ≤ t). */
function valorEm(id: Pt[], t: number): number | null {
  let v: number | null = null;
  for (const p of id) { if (p.t <= t) v = p.v; else break; }
  return v;
}

/**
 * Soma os incrementos positivos de um totalizador.
 * Com `id` + `ativacao`, só conta os incrementos em que a tag de identificação
 * do produto estava igual ao valor de ativação (ex.: 0 ou 1).
 */
export function acumuladoTotalizador(total: Pt[], id?: Pt[] | null, ativacao?: number | null): number {
  const filtra = id && id.length > 0 && ativacao != null;
  let s = 0;
  for (let i = 1; i < total.length; i++) {
    const d = total[i]!.v - total[i - 1]!.v;
    if (d <= 0) continue;
    if (filtra && valorEm(id!, total[i - 1]!.t) !== ativacao) continue;
    s += d;
  }
  return s;
}

/** Consumo de uma MP: totalizador (incrementos) ou direto (média × horas), × fator. */
export function consumoMp(pts: Pt[], modo: string, fator: number, id?: Pt[] | null, ativacao?: number | null): number {
  const f = Number.isFinite(fator) && fator > 0 ? fator : 1;
  if (modo === "direto") {
    // vazão por hora integrada no tempo (trapézios)
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!;
      if (id && id.length && ativacao != null && valorEm(id, a.t) !== ativacao) continue;
      s += ((a.v + b.v) / 2) * ((b.t - a.t) / 3600_000);
    }
    return s * f;
  }
  return acumuladoTotalizador(pts, id, ativacao) * f;
}

/** O índice de conversão usa sempre a 1ª matéria-prima da receita. */
export function consumoBaseIndice(mats: Array<{ qtd: string | number }>): number {
  return Number(mats[0]?.qtd) || 0;
}

/**
 * Total de uma tag "pura" das Tags ao vivo, que já acumula sozinha (ex.: total do produto
 * ou consumo da MP). Soma os incrementos do período, tolerando zeragens do CLP.
 */
export function totalTagPura(pts: Pt[]): number {
  return acumuladoTotalizador(pts);
}
