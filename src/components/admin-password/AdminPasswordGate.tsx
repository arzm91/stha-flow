/**
 * Confirmação por senha de administrador/gerente desativada.
 * Todos os usuários autenticados podem alterar e excluir dados do seu tenant,
 * respeitando as políticas RLS multitenant.
 *
 * Os pontos de chamada foram mantidos (no-op) para não quebrar o sistema.
 */
export async function requireAdminPassword(_reason?: string): Promise<boolean> {
  return true;
}

export function AdminPasswordGate() {
  return null;
}
