import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Smartphone, Trash2, Send, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enablePushNotifications, getPushSupportStatus, refreshPushRegistration } from "@/lib/push/client";
import { sendTestPushToSelf } from "@/lib/push/notifications.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type Device = {
  id: string;
  rotulo: string | null;
  plataforma: string | null;
  ativo: boolean;
  created_at: string;
  ultima_notificacao_em: string | null;
};

export function PushNotificationsCard() {
  const qc = useQueryClient();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [supportReason, setSupportReason] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const testFn = useServerFn(sendTestPushToSelf);

  useEffect(() => {
    getPushSupportStatus().then((status) => {
      setSupported(status.ok);
      setSupportReason(status.reason ?? null);
    });
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
    // Silent token refresh — mantém o dispositivo ativo mesmo sem clicar em "Ativar"
    refreshPushRegistration().then((r) => {
      if (r.ok) qc.invalidateQueries({ queryKey: ["push_devices:self"] });
    });
  }, [qc]);

  const { data: devices = [] } = useQuery({
    queryKey: ["push_devices:self"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("push_devices")
        .select("id,rotulo,plataforma,ativo,created_at,ultima_notificacao_em")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Device[];
    },
  });

  const handleEnable = async () => {
    setBusy(true);
    const res = await enablePushNotifications();
    setBusy(false);
    if (!res.ok) {
      if (res.reason === "unsupported") toast.error("Este navegador não suporta notificações push");
      else if (res.reason === "ios_requires_home_screen") toast.error("No iPhone, abra o STHApc pelo ícone salvo na Tela de Início para ativar o push.");
      else if (res.reason === "preview_unavailable") toast.error("Ative pelo domínio publicado do STHApc; o preview não permite registrar o service worker de push.");
      else if (res.reason === "permission_denied") toast.error("Permissão negada. Habilite nas configurações do navegador.");
      else toast.error(`Falha ao ativar: ${res.reason ?? "erro desconhecido"}`);
      return;
    }
    setPermission("granted");
    toast.success("Notificações push ativadas neste dispositivo!");
    qc.invalidateQueries({ queryKey: ["push_devices:self"] });
  };

  const removeDevice = async (id: string) => {
    const { error } = await supabase.from("push_devices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Dispositivo removido");
    qc.invalidateQueries({ queryKey: ["push_devices:self"] });
  };

  const toggleDevice = async (id: string, ativo: boolean) => {
    const { error } = await supabase.from("push_devices").update({ ativo: !ativo }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["push_devices:self"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" /> Notificações no celular
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {supported === false && (
          <p className="text-sm text-muted-foreground">
            {supportReason === "preview_unavailable"
              ? "Notificações push devem ser ativadas pelo domínio publicado do STHApc; o preview não permite registrar o service worker de push."
              : supportReason === "ios_requires_home_screen"
                ? "No iPhone, abra o STHApc pelo ícone salvo na Tela de Início; o Safari normal não libera push."
                : "Seu navegador não suporta notificações push nesta tela."}
          </p>
        )}
        {supported !== false && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleEnable} disabled={busy}>
              <Bell className="mr-2 h-4 w-4" />
              {permission === "granted" ? "Ativar neste dispositivo" : "Ativar notificações"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Permissão do navegador: <Badge variant="outline">{permission}</Badge>
            </span>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-sm font-medium">Meus dispositivos</div>
          {devices.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum dispositivo registrado ainda.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 p-3">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.rotulo ?? d.plataforma ?? "Dispositivo"}</div>
                    <div className="text-xs text-muted-foreground">
                      Registrado em {new Date(d.created_at).toLocaleString("pt-BR")}
                      {d.ultima_notificacao_em && ` • última: ${new Date(d.ultima_notificacao_em).toLocaleString("pt-BR")}`}
                    </div>
                  </div>
                  <Badge variant={d.ativo ? "default" : "secondary"}>{d.ativo ? "Ativo" : "Pausado"}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => toggleDevice(d.id, d.ativo)}>
                    {d.ativo ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeDevice(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
