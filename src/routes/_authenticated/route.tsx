import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { AutoTagSync } from "@/components/AutoTagSync";
import { PendingApprovalsDock } from "@/components/automation/PendingApprovalsDock";
import { AlertasFloatingPopup } from "@/components/alertas/AlertasFloatingPopup";
import { ParadaMotivoDialog } from "@/components/paradas/ParadaMotivoDialog";
import { SessionKeeper } from "@/components/auth/SessionKeeper";

import { PageAccessGuard } from "@/components/PageAccessGuard";
import { AdminPasswordGate } from "@/components/admin-password/AdminPasswordGate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Estratégia tolerante a falhas transitórias (rede/aba em segundo plano):
    // 1) tenta sessão atual
    // 2) se vazia, tenta refresh
    // 3) se falhar por rede, aguarda 250ms e tenta uma última vez
    // Só redireciona ao /auth se realmente não houver sessão nem refresh possível.
    let session = (await supabase.auth.getSession()).data.session;

    if (!session) {
      try {
        session = (await supabase.auth.refreshSession()).data.session;
      } catch {
        // ignore
      }
    }

    if (!session) {
      // Uma última tentativa após um pequeno delay — cobre corridas com
      // outra aba que acabou de rotacionar o refresh token.
      await new Promise((r) => setTimeout(r, 250));
      session = (await supabase.auth.getSession()).data.session;
    }

    if (!session) {
      // Preserva a rota atual para retornar após o login.
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }
    return { user: session.user };
  },
  component: () => (
    <AppShell>
      <SessionKeeper />
      <AutoTagSync />
      <PageAccessGuard>
        <Outlet />
      </PageAccessGuard>
      <PendingApprovalsDock />
      <AlertasFloatingPopup />
      <ParadaMotivoDialog />

      <AdminPasswordGate />
    </AppShell>
  ),
});

