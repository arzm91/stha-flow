/** Id sentinela usado no acompanhamento contínuo do equipamento (sem OP). */
export const VIRT_OP_ID = "00000000-0000-0000-0000-000000000000";
export const isVirtualOp = (id: string | null | undefined) => id === VIRT_OP_ID;
/** Filtro PostgREST: por ordem, ou (sem OP) pelo início da janela. */
export function filtroOrdem(ordemId: string, desde: string | null | undefined, campo = "registrado_em") {
  return isVirtualOp(ordemId) ? `${campo}.gte.${desde ?? new Date(Date.now() - 24 * 3600_000).toISOString()}` : `ordem_id.eq.${ordemId}`;
}
