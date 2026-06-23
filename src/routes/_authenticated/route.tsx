import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { AutoTagSync } from "@/components/AutoTagSync";
import { PendingApprovalsDock } from "@/components/automation/PendingApprovalsDock";
import { AlertasFloatingPopup } from "@/components/alertas/AlertasFloatingPopup";
import { PageAccessGuard } from "@/components/PageAccessGuard";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
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
    </AppShell>
  ),
});
