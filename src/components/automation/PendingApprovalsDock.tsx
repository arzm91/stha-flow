import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { approveRun, executeRun, rejectRun, snoozeRun } from "@/lib/automation/runs.functions";
import { Bell, Check, X, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { ApprovalDialog, type ApprovalPayload } from "./ApprovalDialog";

type ActionNode = {
  id?: string;
  type?: string;
  data?: { label?: string; config?: Record<string, unknown> };
};
type Run = {
  id: string;
  flow_id: string;
  status: string;
  trigger_context: Record<string, unknown> | null;
  planned_actions:
    | Array<ActionNode>
    | { nodes?: Array<ActionNode>; edges?: unknown }
    | null;
  created_at: string;
  flow?: { nome: string } | null;
};

export function PendingApprovalsDock() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [open, setOpen] = useState(true);
  const approve = useServerFn(approveRun);
  const execute = useServerFn(executeRun);
  const reject = useServerFn(rejectRun);
  const snooze = useServerFn(snoozeRun);
  const [busy, setBusy] = useState<string | null>(null);
  const autoRunning = useRef(new Set<string>());

  async function load() {
    const { data } = await supabase
      .from("automation_runs")
      .select("id,flow_id,status,trigger_context,planned_actions,created_at,flow:automation_flows(nome)")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(20);
    setRuns(((data as unknown) as Run[]) ?? []);
  }

  async function autoRunApproved() {
    const { data } = await supabase
      .from("automation_runs")
      .select("id, flow:automation_flows(nome)")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(10);
    for (const row of (data ?? []) as Array<{ id: string; flow?: { nome?: string } | null }>) {
      if (autoRunning.current.has(row.id)) continue;
      autoRunning.current.add(row.id);
      try {
        const r = await execute({ data: { runId: row.id } });
        if (r.ok) toast.success(`Automação "${row.flow?.nome ?? "Fluxo"}" executada`);
        else toast.error(`Automação "${row.flow?.nome ?? "Fluxo"}" falhou em parte`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao executar automação");
      } finally {
        autoRunning.current.delete(row.id);
      }
    }
  }

  useEffect(() => {
    load();
    autoRunApproved();
    const channel = supabase
      .channel("automation_runs_dock")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automation_runs" },
        () => {
          load();
          autoRunApproved();
        },
      )
      .subscribe();
    const tick = setInterval(autoRunApproved, 20_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dialogRun, setDialogRun] = useState<Run | null>(null);
  const [dialogQtd, setDialogQtd] = useState(0);
  const [dialogNumero, setDialogNumero] = useState("");
  const [dialogProdutoId, setDialogProdutoId] = useState<string | null>(null);

  function finalizarNodes(r: Run): ActionNode[] {
    const pa = r.planned_actions;
    const nodesArr = Array.isArray(pa) ? pa : (pa?.nodes ?? []);
    return nodesArr.filter(
      (n) => n.type === "action" && n.data?.config?.type === "finalizar_op",
    );
  }
  function runNeedsApprovalDialog(r: Run): boolean {
    const fins = finalizarNodes(r);
    // Se todos finalizar_op forem "sem_aprovacao", não abre diálogo.
    return fins.length > 0 && fins.some((n) => n.data?.config?.sem_aprovacao !== true);
  }
  function runIsFullyAutomatic(r: Run): boolean {
    const fins = finalizarNodes(r);
    return fins.length > 0 && fins.every((n) => n.data?.config?.sem_aprovacao === true);
  }

  async function openApprovalFor(r: Run) {
    const pa = r.planned_actions;
    const nodesArr = Array.isArray(pa) ? pa : (pa?.nodes ?? []);
    const finalAction = nodesArr.find(
      (n) => n.type === "action" && n.data?.config?.type === "finalizar_op",
    );
    const equipId = (finalAction?.data?.config?.equipamento_id as string) ?? null;
    const qtdTag = (finalAction?.data?.config?.qtd_produzida_tag as string) ?? "";
    let qtd = 0;
    let numero = "";
    let produtoId: string | null = null;
    if (equipId) {
      const { data: op } = await supabase
        .from("ordens_producao")
        .select("qtd_planejada, numero, produto_id, owner_id")
        .eq("equipamento_id", equipId)
        .eq("status", "em_andamento")
        .order("inicio_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      qtd = Number(op?.qtd_planejada ?? 0);
      numero = op?.numero ?? "";
      produtoId = op?.produto_id ?? null;

      // Se há tag configurada como quantidade produzida, usa esse valor como sugestão.
      if (qtdTag && op?.owner_id) {
        const { data: tag } = await supabase
          .from("tags_live").select("valor_num")
          .eq("owner_id", op.owner_id).eq("nome", qtdTag).maybeSingle();
        if (tag?.valor_num != null) qtd = Number(tag.valor_num);
      }
    }
    setDialogQtd(qtd);
    setDialogNumero(numero);
    setDialogProdutoId(produtoId);
    setDialogRun(r);
  }

  async function handleApprove(id: string, payload?: ApprovalPayload) {
    setBusy(id);
    try {
      const r = await approve({ data: { runId: id, payload } });
      if (r.ok) toast.success("Ações executadas");
      else toast.error("Falha em ao menos uma ação");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
    setBusy(null);
    setDialogRun(null);
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
                const pa = r.planned_actions;
                const nodesArr = Array.isArray(pa) ? pa : (pa?.nodes ?? []);
                const actions = nodesArr.filter((n) => n.type === "action");
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
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          runNeedsApprovalDialog(r) ? openApprovalFor(r) : handleApprove(r.id)
                        }
                        disabled={busy === r.id}
                      >
                        <Check className="mr-1 size-3" />
                        {runNeedsApprovalDialog(r) ? "Configurar e aprovar" : "Aprovar"}
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
      {dialogRun && (
        <ApprovalDialog
          open={!!dialogRun}
          onOpenChange={(o) => { if (!o) setDialogRun(null); }}
          flowName={dialogRun.flow?.nome ?? "Fluxo"}
          opNumero={dialogNumero}
          opProdutoId={dialogProdutoId}
          qtdSugerida={dialogQtd}
          needsDestinos={true}
          busy={busy === dialogRun.id}
          onConfirm={(payload) => handleApprove(dialogRun.id, payload)}
        />
      )}
    </div>
  );
}
