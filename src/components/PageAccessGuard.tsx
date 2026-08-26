/**
 * Restrições de acesso por página removidas.
 * Qualquer usuário autenticado pode acessar todas as páginas; o isolamento
 * entre empresas continua garantido pelas políticas RLS multitenant.
 */
export function PageAccessGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
