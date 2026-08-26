// Card na página PCP: programação automática de produção.
// Lista as automações que mexem com ordens de produção (criar/iniciar/finalizar)
// e permite ativar/desativar e criar novas pelo assistente guiado — sem sair
// da página de produção. O motor é o mesmo de /automacoes.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wand2, Zap, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AssistenteFluxo } from "@/components/automation/AssistenteFluxo";
import { COMPARADORES, PRODUCTION_EVENTS } from "@/lib/automation/types";

const PROD_ACTIONS = ["criar_ordem", "iniciar_op", "finalizar_op", "avancar_ordem"];

const ACTION_LABELS: Record<string, string> = {
  criar_ordem: "criar OP",
  iniciar_op: "iniciar produção",
  finalizar_op: "finalizar produção",
  avancar_ordem: "avançar ordem",
};

type Flow = {
  id: string;
  nome: string;
  ativo: boolean;
  trigger_type: string | null;
  trigger_config: Record<string, unknown> | null;
  last_triggered_at: string | null;
  graph: { nodes?: Array<{ type: string; data?: { config?: Record<string, unknown> } }> } | null;
};

function triggerSummary(f: Flow): string {
  const cfg = f.trigger_config ?? {};
  switch (f.trigger_type) {
    case "schedule": {
      const cron = String(cfg.cron ?? "");
      const parts = cron.split(/\s+/);
      if (parts.length === 5) {
        const hh = String(parts[1]).padStart(2, "0");
        const mm = String(parts[0]).padStart(2, "0");
        if (parts[2] === "*" && parts[3] === "*" && parts[4] === "*") return `todo dia às ${hh}:${mm}`;
        if (parts[4] !== "*") return `às ${hh}:${mm} nos dias ${parts[4]}`;
        if (parts[0].startsWith("*/")) return `a cada ${parts[0].slice(2)} min`;
        if (parts[1].startsWith("*/")) return `a cada ${parts[1].slice(2)} h`;
      }
      return `agendamento (${cron || "sem horário"})`;
    }
    case "tag_value": {
      const op = COMPARADORES.find((c) => c.value === cfg.operador)?.label ?? cfg.operador ?? "";
      return `quando ${String(cfg.tag_nome ?? "tag")} ${op} ${String(cfg.valor ?? "")}`;
    }
    case "tag_stabilization":
      return `quando ${String(cfg.tag_nome ?? "tag")} estabilizar`;
    case "production_event": {
      const ev = PRODUCTION_EVENTS.find((e) => e.value === cfg.evento)?.label ?? cfg.evento ?? "";
      return `quando houver: ${ev}`;
    }
    default:
      return "sem gatilho";
  }
}

function actionsSummary(f: Flow): string {
  const types = (f.graph?.nodes ?? [])
    .filter((n) => n.type === "action")
    .map((n) => String(n.data?.config?.type ?? ""))
    .filter(Boolean);
  const unique = [...new Set(types)];
  return unique.map((t) => ACTION_LABELS[t] ?? t).join(", ") || "—";
}

export function ProgramacaoAutomaticaCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assistente, setAssistente] = useState(false);

  const flows = useQuery({
    queryKey: ["pcp-automacoes-prod"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_flows")
        .select("id,nome,ativo,trigger_type,trigger_config,last_triggered_at,graph")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const all = (data ?? []) as unknown as Flow[];
      return all.filter((f) =>
        (f.graph?.nodes ?? []).some(
          (n) => n.type === "action" && PROD_ACTIONS.includes(String(n.data?.config?.type ?? "")),
        ),
      );
    },
  });

  async function toggle(f: Flow) {
    const { requireAdminPassword } = await import("@/components/admin-password/AdminPasswordGate");
    if (!(await requireAdminPassword(`alterar a automação "${f.nome}"`))) return;
    const { error } = await supabase.from("automation_flows").update({ ativo: !f.ativo }).eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["pcp-automacoes-prod"] });
  }

  const list = flows.data ?? [];

  return (
    <Card className="mb-4">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            onClick={() => setOpen((o) => !o)}
          >
            <Zap className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm">Programação automática de produção</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              {list.filter((f) => f.ativo).length} ativa(s)
            </Badge>
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          <Button size="sm" variant="outline" onClick={() => setAssistente(true)}>
            <Wand2 className="mr-2 h-4 w-4" />Nova programação automática
          </Button>
        </div>
        {!open && (
          <p className="text-xs text-muted-foreground">
            Inicie e finalize ordens sozinho por horário, valor de tag ou evento — ex.: "todo dia às 08:00, iniciar a produção do R7".
          </p>
        )}
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          {flows.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma automação de produção ainda. Clique em <strong>Nova programação automática</strong> para criar a primeira.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {list.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-3 py-2">
                  <Switch checked={f.ativo} onCheckedChange={() => toggle(f)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {triggerSummary(f)} <ArrowRight className="inline h-3 w-3" /> {actionsSummary(f)}
                      {f.last_triggered_at && (
                        <> · último disparo {new Date(f.last_triggered_at).toLocaleString("pt-BR")}</>
                      )}
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/automacoes/$id" params={{ id: f.id }}>Editar</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
      <AssistenteFluxo open={assistente} onOpenChange={setAssistente} />
    </Card>
  );
}
