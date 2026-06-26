import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { Plus, Workflow, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Flow = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  trigger_type: string | null;
  last_triggered_at: string | null;
};

export const Route = createFileRoute("/_authenticated/automacoes/")({
  component: AutomacoesIndex,
});

function AutomacoesIndex() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_flows")
      .select("id,nome,descricao,ativo,trigger_type,last_triggered_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setFlows((data as Flow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createFlow() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase
      .from("automation_flows")
      .insert({ owner_id: u.user.id, nome: "Novo fluxo" })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/automacoes/$id", params: { id: data.id } });
  }

  async function toggleAtivo(flow: Flow) {
    const { requireAdminPassword } = await import("@/components/admin-password/AdminPasswordGate");
    if (!(await requireAdminPassword(`alterar o fluxo "${flow.nome}"`))) return;
    const { error } = await supabase
      .from("automation_flows")
      .update({ ativo: !flow.ativo })
      .eq("id", flow.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFlows((f) => f.map((x) => (x.id === flow.id ? { ...x, ativo: !x.ativo } : x)));
  }

  async function removeFlow(flow: Flow) {
    if (!confirm(`Excluir fluxo "${flow.nome}"?`)) return;
    const { requireAdminPassword } = await import("@/components/admin-password/AdminPasswordGate");
    if (!(await requireAdminPassword(`excluir o fluxo "${flow.nome}"`))) return;
    const { error } = await supabase.from("automation_flows").delete().eq("id", flow.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFlows((f) => f.filter((x) => x.id !== flow.id));
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Automações"
        description="Crie fluxos visuais para automatizar tarefas a partir de tags, eventos de produção e agendamentos."
        actions={
          <Button onClick={createFlow}>
            <Plus className="mr-2 size-4" /> Novo fluxo
          </Button>
        }
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Workflow className="mb-3 size-10 text-muted-foreground" />
            <h3 className="text-lg font-medium">Nenhum fluxo ainda</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Crie seu primeiro fluxo para reagir automaticamente a tags, eventos e horários.
            </p>
            <Button className="mt-4" onClick={createFlow}>
              <Plus className="mr-2 size-4" /> Criar fluxo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flows.map((flow) => (
            <Card key={flow.id} className="group">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    <Link to="/automacoes/$id" params={{ id: flow.id }} className="hover:underline">
                      {flow.nome}
                    </Link>
                  </CardTitle>
                  {flow.descricao && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{flow.descricao}</p>
                  )}
                </div>
                <Switch checked={flow.ativo} onCheckedChange={() => toggleAtivo(flow)} />
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="flex gap-2 text-xs">
                  {flow.trigger_type ? (
                    <Badge variant="secondary">{flow.trigger_type}</Badge>
                  ) : (
                    <Badge variant="outline">sem gatilho</Badge>
                  )}
                  {flow.last_triggered_at && (
                    <Badge variant="outline">
                      último: {new Date(flow.last_triggered_at).toLocaleString("pt-BR")}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => removeFlow(flow)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
