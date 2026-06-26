export type PageDef = {
  key: string;
  label: string;
  pathPrefix: string;
};

export const MANAGED_PAGES: PageDef[] = [
  { key: "dashboard", label: "Dashboard", pathPrefix: "/dashboard" },
  { key: "producao", label: "Produção", pathPrefix: "/producao" },
  { key: "estoque", label: "Estoque", pathPrefix: "/estoque" },
  { key: "tags", label: "Tags ao Vivo", pathPrefix: "/tags" },
  { key: "monitoramento", label: "Monitoramento", pathPrefix: "/monitoramento" },

  { key: "tabelas", label: "Tabelas", pathPrefix: "/tabelas" },
  { key: "automacoes", label: "Automações", pathPrefix: "/automacoes" },
  { key: "alertas", label: "Alertas", pathPrefix: "/alertas" },
  { key: "cadastros", label: "Cadastros", pathPrefix: "/cadastros" },
  { key: "relatorios", label: "Relatórios", pathPrefix: "/relatorios" },
  { key: "turnos", label: "Turnos", pathPrefix: "/turnos" },
  { key: "manutencao", label: "Manutenção", pathPrefix: "/manutencao" },
  { key: "indicadores", label: "Indicadores", pathPrefix: "/indicadores" },
];

/** Pages that are always admin-only (not configurable per user). */
export const ADMIN_ONLY_PREFIXES = ["/configuracoes"];

export function pageKeyForPath(pathname: string): string | null {
  const match = MANAGED_PAGES.find(
    (p) => pathname === p.pathPrefix || pathname.startsWith(p.pathPrefix + "/"),
  );
  return match?.key ?? null;
}

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
