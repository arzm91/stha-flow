import { useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { isAdminOnlyPath, pageKeyForPath } from "@/lib/permissions/pages";
import { toast } from "sonner";

export function PageAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, loading, canView } = usePagePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (isAdminOnlyPath(pathname) && !isAdmin) {
      toast.error("Acesso restrito a administradores");
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    const key = pageKeyForPath(pathname);
    if (key && !canView(key)) {
      toast.error("Você não tem permissão para acessar essa página");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [pathname, isAdmin, loading, canView, navigate]);

  return <>{children}</>;
}
