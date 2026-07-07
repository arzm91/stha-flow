import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Save, Zap, Filter, Cog } from "lucide-react";
import { toast } from "sonner";
import { NodeConfigPanel } from "@/components/automation/NodeConfigPanel";

export const Route = createFileRoute("/_authenticated/automacoes/$id")({
  head: pageHead({ title: "Automações · Detalhes — STHApc", description: "Visualize detalhes no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: (params) => `/automacoes/${params.id}` }),
  component: AutomacaoEditor,
});

type FlowNodeData = { label: string; kind: string; config: Record<string, unknown> };

const NODE_STYLES: Record<string, string> = {
  trigger: "border-amber-500/60 bg-amber-500/10",
  condition: "border-sky-500/60 bg-sky-500/10",
  action: "border-emerald-500/60 bg-emerald-500/10",
};

function AutomacaoEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("automation_flows")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast.error(error?.message ?? "Fluxo não encontrado");
        navigate({ to: "/automacoes" });
        return;
      }
      setNome(data.nome);
      setDescricao(data.descricao ?? "");
      setAtivo(data.ativo);
      setRequiresApproval(data.requires_approval);
      const g = (data.graph as { nodes?: Node<FlowNodeData>[]; edges?: Edge[] }) ?? {};
      setNodes(g.nodes ?? []);
      setEdges(g.edges ?? []);
      setLoading(false);
    })();
  }, [id, navigate]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as Node<FlowNodeData>[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge({ ...conn, animated: true }, eds)),
    [],
  );

  function addNode(kind: "trigger" | "condition" | "action") {
    if (kind === "trigger" && nodes.some((n) => n.type === "trigger")) {
      toast.warning("Cada fluxo só pode ter um gatilho");
      return;
    }
    const newNode: Node<FlowNodeData> = {
      id: crypto.randomUUID(),
      type: kind,
      position: { x: 100 + nodes.length * 40, y: 100 + nodes.length * 40 },
      data: {
        label: kind === "trigger" ? "Gatilho" : kind === "condition" ? "Condição" : "Ação",
        kind,
        config: {},
      },
    };
    setNodes((n) => [...n, newNode]);
    setSelectedId(newNode.id);
  }

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  function updateNode(next: Node<FlowNodeData>) {
    setNodes((n) => n.map((x) => (x.id === next.id ? next : x)));
  }
  function deleteNode(nodeId: string) {
    setNodes((n) => n.filter((x) => x.id !== nodeId));
    setEdges((e) => e.filter((x) => x.source !== nodeId && x.target !== nodeId));
    setSelectedId(null);
  }

  async function save() {
    setSaving(true);
    const triggerNode = nodes.find((n) => n.type === "trigger");
    const triggerType = (triggerNode?.data?.config as { type?: string })?.type ?? null;
    const triggerConfig = (triggerNode?.data?.config as Record<string, unknown>) ?? {};

    const { error } = await supabase
      .from("automation_flows")
      .update({
        nome,
        descricao: descricao || null,
        ativo,
        requires_approval: requiresApproval,
        graph: { nodes, edges } as never,
        trigger_type: triggerType,
        trigger_config: triggerConfig as never,
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Fluxo salvo");
  }

  const renderedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        className: `rounded-md border-2 px-3 py-2 text-sm shadow-sm ${NODE_STYLES[n.type ?? "action"]}`,
        data: { ...n.data, label: n.data.label || "(sem nome)" },
      })),
    [nodes],
  );

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b p-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/automacoes" })}>
          <ArrowLeft className="mr-1 size-4" /> Voltar
        </Button>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="max-w-xs" />
        <Input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição"
          className="max-w-sm"
        />
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="ativo" className="text-xs">Ativo</Label>
            <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="appr" className="text-xs">Requer aprovação</Label>
            <Switch id="appr" checked={requiresApproval} onCheckedChange={setRequiresApproval} />
          </div>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 size-4" /> {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-48 flex-col gap-2 border-r bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">ADICIONAR NÓ</p>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => addNode("trigger")}>
            <Zap className="mr-2 size-4 text-amber-500" /> Gatilho
          </Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => addNode("condition")}>
            <Filter className="mr-2 size-4 text-sky-500" /> Condição
          </Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => addNode("action")}>
            <Cog className="mr-2 size-4 text-emerald-500" /> Ação
          </Button>
          <p className="mt-4 text-[11px] leading-snug text-muted-foreground">
            Conecte os nós arrastando entre as bolinhas. Clique em um nó para configurar.
          </p>
        </div>

        <div className="flex-1">
          <ReactFlowProvider>
            <ReactFlow
              nodes={renderedNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
            >
              <Background gap={16} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode as never}
            onChange={(n) => updateNode(n as never)}
            onClose={() => setSelectedId(null)}
            onDelete={() => deleteNode(selectedNode.id)}
          />
        )}

        {!selectedNode && nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-lg border bg-card/80 px-4 py-3 text-sm text-muted-foreground backdrop-blur">
            <Plus className="mr-1 inline size-4" /> Comece adicionando um <b>Gatilho</b> na barra lateral.
          </div>
        )}
      </div>
    </div>
  );
}
