export const ADMIN_CANCELLED = "__admin_cancelled__";

/**
 * Confirmação por senha desativada.
 * Todos os usuários autenticados podem editar/excluir dentro do seu tenant (RLS).
 * Mantido como no-op para não quebrar as chamadas existentes.
 */
export async function guardAdmin(_reason: string): Promise<void> {
  return;
}

export function isAdminCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === ADMIN_CANCELLED;
}
