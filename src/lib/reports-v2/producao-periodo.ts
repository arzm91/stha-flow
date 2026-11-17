/** Regras puras do relatório universal de produção. */
export function indiceConversao(consumido: number, produzido: number): number | null {
  return produzido > 0 ? consumido / produzido : null;
}

/** Segundos de sobreposição entre [a1,a2] e [b1,b2] (ms epoch). */
export function sobreposicaoSeg(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, (Math.min(a2, b2) - Math.max(a1, b1)) / 1000);
}

/** Disponibilidade (%) = tempo operando / tempo total. */
export function disponibilidade(totalSeg: number, paradoSeg: number): number | null {
  if (totalSeg <= 0) return null;
  return Math.max(0, Math.min(100, ((totalSeg - paradoSeg) / totalSeg) * 100));
}
