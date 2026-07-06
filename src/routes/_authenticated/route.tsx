import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { AutoTagSync } from "@/components/AutoTagSync";
import { PendingApprovalsDock } from "@/components/automation/PendingApprovalsDock";
import { AlertasFloatingPopup } from "@/components/alertas/AlertasFloatingPopup";
import { PageAccessGuard } from "@/components/PageAccessGuard";
import { AdminPasswordGate } from "@/components/admin-password/AdminPasswordGate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Try current session first; if missing/expired, attempt a refresh before
    // redirecting to /auth. Evita deslogar por falhas momentâneas de refresh
    // (rede, aba em segundo plano, token quase expirando).
    let { data } = await supabase.auth.getSession();
    if (!data.session) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.session) data = { session: refreshed.session } as typeof data;
      } catch {
        // ignore — cai no redirect abaixo
      }
    }
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: () => (
    <AppShell>
      <AutoTagSync />
      <PageAccessGuard>
        <Outlet />
      </PageAccessGuard>
      <PendingApprovalsDock />
      <AlertasFloatingPopup />
      <AdminPasswordGate />
    </AppShell>
  ),
});
