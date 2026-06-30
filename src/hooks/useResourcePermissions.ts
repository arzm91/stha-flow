import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export type ResourceType = "equipamento" | "tanque" | "produto" | "custom_sheet";

type ResourcePermsState = {
  isAdmin: boolean;
  loading: boolean;
  allowed: (type: ResourceType, id: string) => boolean;
  /** Filter a list of rows by checking row.id against the user's allowed ids. */
  filter: <T extends { id: string }>(type: ResourceType, rows: T[] | undefined | null) => T[];
};

/**
 * Per-resource visibility for the current user.
 * Default policy: deny when no allowlist exists (admin always allowed).
 */
export function useResourcePermissions(): ResourcePermsState {
  const { isAdmin, loading: pagesLoading } = usePagePermissions();

  const q = useQuery({
    queryKey: ["resource-permissions:self"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return {} as Record<ResourceType, Set<string>>;
      const { data, error } = await supabase
        .from("user_resource_permissions")
        .select("resource_type, resource_id")
        .eq("user_id", u.user.id);
      if (error) throw error;
      const map: Record<string, Set<string>> = {};
      for (const r of data ?? []) {
        const t = r.resource_type as string;
        (map[t] ??= new Set()).add(r.resource_id as string);
      }
      return map as Record<ResourceType, Set<string>>;
    },
    staleTime: 60_000,
    enabled: !isAdmin, // admins skip the lookup entirely
  });

  const allowed = (type: ResourceType, id: string) => {
    if (isAdmin) return true;
    const set = q.data?.[type];
    return !!set && set.has(id);
  };

  const filter = <T extends { id: string }>(type: ResourceType, rows: T[] | undefined | null): T[] => {
    if (!rows) return [];
    if (isAdmin) return rows;
    const set = q.data?.[type];
    if (!set) return [];
    return rows.filter((r) => set.has(r.id));
  };

  return {
    isAdmin,
    loading: pagesLoading || (!isAdmin && q.isLoading),
    allowed,
    filter,
  };
}
