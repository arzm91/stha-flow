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

export function usePagePermissions(): PermissionsState {
  const query = useQuery({
    queryKey: ["page-permissions:self"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { isAdmin: false, isGerente: false, permissions: [] as PermissionRow[] };
      const [{ data: roles }, { data: perms }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase
          .from("user_permissions")
          .select("page_key, can_view, can_edit")
          .eq("user_id", u.user.id),
      ]);
      const roleList = (roles ?? []).map((r) => r.role as string);
      return {
        isAdmin: roleList.includes("admin"),
        isGerente: roleList.includes("gerente"),
        permissions: (perms ?? []) as PermissionRow[],
      };
    },
    staleTime: 60_000,
  });

  const isAdmin = query.data?.isAdmin ?? false;
  const isGerente = query.data?.isGerente ?? false;
  const permissions = query.data?.permissions ?? [];

  return {
    isAdmin,
    isGerente,
    canManageUsers: isAdmin || isGerente,
    loading: query.isLoading,
    permissions,
    canView: (key: string) =>
      isAdmin || isGerente || permissions.some((p) => p.page_key === key && p.can_view),
    canEdit: (key: string) =>
      isAdmin || isGerente || permissions.some((p) => p.page_key === key && p.can_edit),
  };
}
