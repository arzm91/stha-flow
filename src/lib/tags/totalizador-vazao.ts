/** Integração temporal de vazão (odômetro contínuo, nunca zera). */
export type VazaoBase = "h" | "min" | "s";

const MS: Record<VazaoBase, number> = { h: 3_600_000, min: 60_000, s: 1000 };

/** Lacunas maiores que isto (ex.: sem dados) não são integradas, evitando saltos. */
export const MAX_GAP_MS = 15 * 60_000;

/**
 * Incremento de massa entre duas leituras de vazão (trapézio).
 * Vazões negativas contam como 0. Retorna 0 se a lacuna for inválida ou grande demais.
 */
export function incrementoVazao(
  prev: number | null, atual: number, dtMs: number, base: VazaoBase = "h", fator = 1,
): number {
  if (!Number.isFinite(atual) || !Number.isFinite(dtMs) || dtMs <= 0 || dtMs > MAX_GAP_MS) return 0;
  const a = Math.max(0, prev != null && Number.isFinite(prev) ? prev : atual);
  const b = Math.max(0, atual);
  const f = Number.isFinite(fator) && fator > 0 ? fator : 1;
  return ((a + b) / 2) * (dtMs / MS[base]) * f;
}
