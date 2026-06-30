import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { approveRun, executeRun, rejectRun, snoozeRun } from "@/lib/automation/runs.functions";
import { Bell, Check, X, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

type Run = {
  id: string;
  flow_id: string;
  status: string;
  trigger_context: Record<string, unknown> | null;
  planned_actions: Array<{ id?: string; type?: string; data?: { label?: string; config?: Record<string, unknown> } }> | null;
  created_at: string;
  flow?: { nome: string } | null;
};

export function PendingApprovalsDock() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [open, setOpen] = useState(true);
  const approve = useServerFn(approveRun);
  const reject = useServerFn(rejectRun);
  const snooze = useServerFn(snoozeRun);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("automation_runs")
      .select("id,flow_id,status,trigger_context,planned_actions,created_at,flow:automation_flows(nome)")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(20);
    setRuns(((data as unknown) as Run[]) ?? []);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("automation_runs_dock")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automation_runs" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleApprove(id: string) {
    setBusy(id);
    try {
      const r = await approve({ data: { runId: id } });
      if (r.ok) toast.success("Ações executadas");
      else toast.error("Falha em ao menos uma ação");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
    setBusy(null);
    load();
  }
  async function handleReject(id: string) {
    setBusy(id);
    try {
      await reject({ data: { runId: id } });
      toast.info("Rejeitado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
    setBusy(null);
    load();
  }
  async function handleSnooze(id: string) {
    setBusy(id);
    try {
      await snooze({ data: { runId: id, minutes: 15 } });
      toast.info("Adiado por 15 min");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
    setBusy(null);
    load();
  }

  if (runs.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-full max-w-sm">
      <div className="pointer-events-auto">
        <Card className="border-amber-500/40 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bell className="size-4 text-amber-500" />
              Aprovações pendentes
              <Badge variant="secondary">{runs.length}</Badge>
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)}>
              {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </Button>
          </CardHeader>
          {open && (
            <CardContent className="max-h-[60vh] space-y-3 overflow-y-auto">
              {runs.map((r) => {
                const actions = (r.planned_actions ?? []).filter((n) => n.type === "action");
                return (
                  <div key={r.id} className="rounded-md border bg-card p-3">
                    <div className="mb-1 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </div>
                    <div className="text-sm font-medium">{r.flow?.nome ?? "Fluxo"}</div>
                    {r.trigger_context && Object.keys(r.trigger_context).length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Gatilho: <code className="text-[10px]">{JSON.stringify(r.trigger_context).slice(0, 80)}</code>
                      </div>
                    )}
                    {actions.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {actions.map((a, i) => (
                          <li key={i} className="text-muted-foreground">
                            • {a.data?.label || (a.data?.config?.type as string) || "ação"}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex gap-1">
                      <Button size="sm" className="flex-1" onClick={() => handleApprove(r.id)} disabled={busy === r.id}>
                        <Check className="mr-1 size-3" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSnooze(r.id)} disabled={busy === r.id}>
                        <Clock className="size-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReject(r.id)} disabled={busy === r.id}>
                        <X className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
