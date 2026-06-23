import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PermissionRow = {
  page_key: string;
  can_view: boolean;
  can_edit: boolean;
};

export type PermissionsState = {
  isAdmin: boolean;
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
      if (!u.user) return { isAdmin: false, permissions: [] as PermissionRow[] };
      const [{ data: roles }, { data: perms }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase
          .from("user_permissions")
          .select("page_key, can_view, can_edit")
          .eq("user_id", u.user.id),
      ]);
      return {
        isAdmin: (roles ?? []).some((r) => r.role === "admin"),
        permissions: (perms ?? []) as PermissionRow[],
      };
    },
    staleTime: 60_000,
  });

  const isAdmin = query.data?.isAdmin ?? false;
  const permissions = query.data?.permissions ?? [];

  return {
    isAdmin,
    loading: query.isLoading,
    permissions,
    canView: (key: string) =>
      isAdmin || permissions.some((p) => p.page_key === key && p.can_view),
    canEdit: (key: string) =>
      isAdmin || permissions.some((p) => p.page_key === key && p.can_edit),
  };
}
