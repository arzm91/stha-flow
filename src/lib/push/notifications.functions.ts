import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendFcmMessage } from "@/lib/push/fcm.server";

/**
 * Sends a test push notification to every active device owned by the caller.
 * Useful to prove that push works even when the app is closed / user is offline
 * from the web session.
 */
export const sendTestPushToSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: devices, error } = await supabaseAdmin
      .from("push_devices")
      .select("id, fcm_token, owner_id")
      .eq("user_id", context.userId)
      .eq("ativo", true);

    if (error) throw new Error(error.message);
    if (!devices || devices.length === 0) {
      return { ok: false as const, reason: "no_devices", sent: 0, total: 0 };
    }

    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      return { ok: false as const, reason: "fcm_not_configured", sent: 0, total: devices.length };
    }

    const title = "STHApc — teste de notificação";
    const body = "Se você recebeu esta mensagem, o push está funcionando neste dispositivo.";
    const url = "https://sthapc.cloud/configuracoes";

    let sent = 0;
    for (const dev of devices) {
      const res = await sendFcmMessage({
        token: dev.fcm_token,
        title,
        body,
        url,
        data: { kind: "test" },
      });

      await supabaseAdmin.from("push_send_log").insert({
        owner_id: dev.owner_id,
        device_id: dev.id,
        alerta_id: null,
        disparo_id: null,
        titulo: title,
        corpo: body,
        status: res.ok ? "sent" : "error",
        provider_message_id: res.ok ? res.messageId : null,
        erro: res.ok ? null : res.error.slice(0, 500),
      });

      if (res.ok) {
        sent += 1;
        await supabaseAdmin
          .from("push_devices")
          .update({ ultima_notificacao_em: new Date().toISOString() })
          .eq("id", dev.id);
      } else if (res.status === 404 || res.status === 400) {
        // Token unregistered/invalid — deactivate so future sends skip it.
        await supabaseAdmin.from("push_devices").update({ ativo: false }).eq("id", dev.id);
      }
    }

    return { ok: sent > 0, sent, total: devices.length };
  });
