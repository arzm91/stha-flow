import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Eye, Check, X, Bell } from "lucide-react";
import { toast } from "sonner";

type Disparo = {
  id: string;
  alerta_nome: string;
  severidade: "info" | "warn" | "critical";
  mensagem: string;
  created_at: string;
};

const SEV_BORDER: Record<string, string> = {
  info: "border-l-sky-500",
  warn: "border-l-amber-500",
  critical: "border-l-rose-500",
};

const SEV_BADGE: Record<string, string> = {
  info: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  critical: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

export function AlertasFloatingPopup() {
  const [disparos, setDisparos] = useState<Disparo[]>([]);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("alertas_disparos")
      .select("id,alerta_nome,severidade,mensagem,created_at")
      .eq("status", "novo")
      .order("created_at", { ascending: false })
      .limit(10);
    setDisparos((data ?? []) as Disparo[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("alertas_popup")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alertas_disparos" },
        (p) => {
          const row = p.new as Disparo & { status: string };
          if (row.status === "novo") {
            toast.warning(`Alerta: ${row.alerta_nome}`, { description: row.mensagem });
            load();
            setOpen(true);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "alertas_disparos" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function marcarVisto(id: string) {
    setBusy(id);
    await supabase.from("alertas_disparos").update({ status: "visto" }).eq("id", id);
    setBusy(null);
  }
  async function resolver(id: string) {
    setBusy(id);
    const { data: u } = await supabase.auth.getUser();
    await supabase
      .from("alertas_disparos")
      .update({
        status: "resolvido",
        resolvido_em: new Date().toISOString(),
        resolvido_por: u.user?.id ?? null,
      })
      .eq("id", id);
    setBusy(null);
  }

  if (disparos.length === 0) return null;

  // collapsed pill
  if (!open) {
    return (
      <div className="fixed bottom-20 right-4 z-50">
        <Button
          variant="default"
          className="shadow-lg"
          onClick={() => setOpen(true)}
        >
          <Bell className="mr-2 size-4" />
          {disparos.length} alerta{disparos.length > 1 ? "s" : ""}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)]">
      <Card className="border-amber-500/40 shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-amber-400" />
            Alertas novos
            <Badge variant="destructive">{disparos.length}</Badge>
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="max-h-[420px] space-y-2 overflow-y-auto">
          {disparos.map((d) => (
            <div
              key={d.id}
              className={`rounded-md border border-l-4 bg-card/50 p-3 ${SEV_BORDER[d.severidade]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{d.alerta_nome}</span>
                    <Badge variant="outline" className={SEV_BADGE[d.severidade]}>
                      {d.severidade}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{d.mensagem}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(d.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-xs"
                  disabled={busy === d.id}
                  onClick={() => marcarVisto(d.id)}
                >
                  <Eye className="mr-1 size-3" /> Visto
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={busy === d.id}
                  onClick={() => resolver(d.id)}
                >
                  <Check className="mr-1 size-3" /> Resolver
                </Button>
                <Link
                  to="/alertas"
                  className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  ver todos
                </Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
