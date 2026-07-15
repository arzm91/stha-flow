import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { autoSubscribeAfterLogin } from "@/lib/push/client";

/**
 * Mantém a sessão viva enquanto o usuário está usando o app.
 *
 * Problema que resolve: em navegadores móveis (e abas em segundo plano),
 * o timer interno de autoRefresh do Supabase pode ser suspenso pelo SO.
 * Quando o usuário volta ao app, o access token já expirou e a próxima
 * requisição falha, disparando SIGNED_OUT no meio do trabalho.
 *
 * Aqui garantimos um refresh explícito nos gatilhos que importam:
 * - aba volta ao foco (visibilitychange -> visible)
 * - conexão volta (online)
 * - a cada 4 minutos (token dura ~60 min; renova bem antes)
 *
 * Falhas silenciosas por rede não deslogam o usuário — só tentam de novo
 * no próximo gatilho.
 */
export function SessionKeeper() {
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        // Só tenta refresh se realmente existe uma sessão local.
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        // Renova apenas se estiver a menos de 10 min do vencimento.
        const expiresAt = data.session.expires_at ?? 0;
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt - now > 10 * 60) return;
        await supabase.auth.refreshSession();
      } catch {
        // Ignora — próximo gatilho tenta de novo.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) void refresh();
    };
    const onOnline = () => {
      if (!cancelled) void refresh();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    const interval = window.setInterval(() => {
      if (!cancelled) void refresh();
    }, 4 * 60 * 1000);

    // Primeira execução imediata garante token fresco ao entrar.
    void refresh();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
