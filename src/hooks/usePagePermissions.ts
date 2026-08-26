import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PermissionRow = {
  page_key: string;
  can_view: boolean;
  can_edit: boolean;
};

export type PermissionsState = {
  isAdmin: boolean;
  isGerente: boolean;
  canManageUsers: boolean;
  loading: boolean;
  permissions: PermissionRow[];
  canView: (pageKey: string) => boolean;
  canEdit: (pageKey: string) => boolean;
};

/**
 * Sistema de permissões liberado: todo usuário autenticado tem acesso total
 * ao que pertence à sua empresa (isolamento garantido pelo RLS multitenant).
 * Os papéis continuam sendo lidos apenas para exibição/telas de gestão.
 */
export function usePagePermissions(): PermissionsState {
  const query = useQuery({
    queryKey: ["page-permissions:self"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { isAdmin: false, isGerente: false };
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      const roleList = (roles ?? []).map((r) => r.role as string);
      return {
        isAdmin: roleList.includes("admin"),
        isGerente: roleList.includes("gerente"),
      };
    },
    staleTime: 60_000,
  });

  return {
    isAdmin: true,
    isGerente: query.data?.isGerente ?? false,
    canManageUsers: true,
    loading: false,
    permissions: [],
    canView: () => true,
    canEdit: () => true,
  };
}
