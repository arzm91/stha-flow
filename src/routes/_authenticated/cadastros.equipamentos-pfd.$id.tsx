import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  ConnectionMode,
  NodeResizer,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { ArrowLeft, Save, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cadastros/equipamentos-pfd/$id")({
  component: PfdEditor,
});

// ---------- Tipos ----------
type SymbolKind =
  | "tanque" | "bomba" | "trocador" | "valvula" | "reator"
  | "coluna" | "compressor" | "filtro" | "vaso" | "misturador";

type EquipNodeData = {
  kind: "equip";
  symbol: SymbolKind;
  label: string;
  ativo: boolean;
  color?: string | null;
  width?: number;
  height?: number;
};
type TagNodeData = {
  kind: "tag";
  tagNome: string;
  label?: string;
  width?: number;
  height?: number;
};
type AnyData = EquipNodeData | TagNodeData;

type FlowEdgeData = {
  label?: string;
  tipo?: FluidType;
};

type FluidType =
  | "produto" | "vapor" | "agua" | "ar" | "condensado" | "gas" | "quimico" | "outro";

const FLUID_COLORS: Record<FluidType, string> = {
  produto: "#10b981",      // verde
  vapor: "#f97316",        // laranja
  agua: "#3b82f6",         // azul
  ar: "#64748b",           // cinza
  condensado: "#0ea5e9",   // ciano
  gas: "#eab308",          // amarelo
  quimico: "#a855f7",      // roxo
  outro: "#94a3b8",
};

const FLUID_LABEL: Record<FluidType, string> = {
  produto: "Produto", vapor: "Vapor", agua: "Água", ar: "Ar",
  condensado: "Condensado", gas: "Gás", quimico: "Químico", outro: "Outro",
};

const SYMBOL_LABEL: Record<SymbolKind, string> = {
  tanque: "Tanque", bomba: "Bomba", trocador: "Trocador",
  valvula: "Válvula", reator: "Reator", coluna: "Coluna",
  compressor: "Compressor", filtro: "Filtro", vaso: "Vaso",
  misturador: "Misturador",
};

// ---------- Símbolos ISA (SVG) ----------
function SymbolSvg({ kind, ativo, color }: { kind: SymbolKind; ativo: boolean; color?: string | null }) {
  const stroke = color
    ? color
    : ativo ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))";
  const fill = color
    ? `color-mix(in srgb, ${color} 18%, hsl(var(--card)))`
    : ativo ? "hsl(var(--card))" : "hsl(var(--muted))";
  const sw = 2;
  const common = { stroke, strokeWidth: sw, fill };
  const svgProps = {
    viewBox: "0 0 80 80" as const,
    className: "h-full w-full",
    preserveAspectRatio: "xMidYMid meet" as const,
  };

  switch (kind) {
    case "tanque":
      return (
        <svg {...svgProps}>
          <rect x="14" y="14" width="52" height="52" rx="6" {...common} />
          <line x1="14" y1="28" x2="66" y2="28" stroke={stroke} strokeWidth={1} />
        </svg>
      );
    case "vaso":
      return (
        <svg {...svgProps}>
          <path d="M20 22 Q40 6 60 22 L60 58 Q40 74 20 58 Z" {...common} />
        </svg>
      );
    case "bomba":
      return (
        <svg {...svgProps}>
          <circle cx="40" cy="40" r="22" {...common} />
          <path d="M40 18 L62 40 L40 40 Z" fill={stroke} />
        </svg>
      );
    case "compressor":
      return (
        <svg {...svgProps}>
          <circle cx="40" cy="40" r="22" {...common} />
          <path d="M22 22 L58 58 M22 58 L58 22" stroke={stroke} strokeWidth={sw} fill="none" />
        </svg>
      );
    case "trocador":
      return (
        <svg {...svgProps}>
          <circle cx="40" cy="40" r="24" {...common} />
          <path d="M20 30 Q30 40 20 50 M30 30 Q40 40 30 50 M40 30 Q50 40 40 50 M50 30 Q60 40 50 50" stroke={stroke} strokeWidth={sw} fill="none" />
        </svg>
      );
    case "valvula":
      return (
        <svg {...svgProps}>
          <path d="M14 22 L40 40 L14 58 Z M66 22 L40 40 L66 58 Z" {...common} />
        </svg>
      );
    case "reator":
      return (
        <svg {...svgProps}>
          <rect x="20" y="18" width="40" height="44" rx="20" {...common} />
          <line x1="40" y1="14" x2="40" y2="38" stroke={stroke} strokeWidth={sw} />
          <path d="M34 38 L46 38 L40 48 Z" fill={stroke} />
        </svg>
      );
    case "coluna":
      return (
        <svg {...svgProps}>
          <rect x="30" y="8" width="20" height="64" rx="10" {...common} />
          <line x1="30" y1="22" x2="50" y2="22" stroke={stroke} />
          <line x1="30" y1="34" x2="50" y2="34" stroke={stroke} />
          <line x1="30" y1="46" x2="50" y2="46" stroke={stroke} />
          <line x1="30" y1="58" x2="50" y2="58" stroke={stroke} />
        </svg>
      );
    case "filtro":
      return (
        <svg {...svgProps}>
          <path d="M16 18 L64 18 L48 40 L48 64 L32 64 L32 40 Z" {...common} />
        </svg>
      );
    case "misturador":
      return (
        <svg {...svgProps}>
          <rect x="16" y="18" width="48" height="44" rx="4" {...common} />
          <line x1="40" y1="10" x2="40" y2="34" stroke={stroke} strokeWidth={sw} />
          <path d="M28 34 L52 34 M30 42 L50 42" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
  }
}

// Bidirectional handles on all four sides (connectionMode="loose" lets
// source-type handles also receive connections, so a single handle per side
// supports any direction).
function FourSideHandles() {
  const base = "!h-2 !w-2 !bg-primary";
  return (
    <>
      <Handle id="left" type="source" position={Position.Left} className={base} />
      <Handle id="right" type="source" position={Position.Right} className={base} />
      <Handle id="top" type="source" position={Position.Top} className={base} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={base} />
    </>
  );
}

// ---------- Nodes ----------
function EquipNode({ data, selected }: NodeProps) {
  const d = data as unknown as EquipNodeData;
  const w = d.width ?? 110;
  const h = d.height ?? 110;
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center rounded-md border-2 bg-card/80 px-2 py-1 shadow-sm backdrop-blur",
        selected ? "border-primary" : "border-border",
        !d.ativo && "opacity-60",
      )}
      style={{ width: w, height: h }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={70}
        minHeight={70}
        lineClassName="!border-primary"
        handleClassName="!h-2 !w-2 !bg-primary !border-primary"
        keepAspectRatio
      />
      <FourSideHandles />
      <div className="min-h-0 flex-1">
        <SymbolSvg kind={d.symbol} ativo={d.ativo} color={d.color} />
      </div>
      <div className="mt-1 max-w-full truncate text-center text-xs font-medium">
        {d.label || SYMBOL_LABEL[d.symbol]}
      </div>
      {!d.ativo && (
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">inativo</div>
      )}
    </div>
  );
}

type TagLive = {
  nome: string;
  valor: string | null;
  valor_num: number | null;
  unidade: string | null;
};

type AlertaCfg = { tag_nome: string; min_val: number | null; max_val: number | null };

const TagsLiveCtx = {
  tags: new Map<string, TagLive>(),
  alertas: new Map<string, AlertaCfg>(),
};

function TagNode({ data, selected }: NodeProps) {
  const d = data as unknown as TagNodeData;
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const live = TagsLiveCtx.tags.get(d.tagNome);
  const al = TagsLiveCtx.alertas.get(d.tagNome);
  let status: "ok" | "warn" | "alert" | "none" = "none";
  if (live?.valor_num != null && al) {
    if ((al.min_val != null && live.valor_num < al.min_val) ||
        (al.max_val != null && live.valor_num > al.max_val)) {
      status = "alert";
    } else {
      status = "ok";
    }
  } else if (live?.valor_num != null) {
    status = "ok";
  } else if (d.tagNome) {
    status = "warn";
  }
  const statusCls = {
    ok: "border-emerald-500/60 bg-emerald-500/10",
    warn: "border-amber-500/60 bg-amber-500/10",
    alert: "border-red-500/70 bg-red-500/15 animate-pulse",
    none: "border-border bg-card",
  }[status];

  const valor = live?.valor_num != null
    ? live.valor_num.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
    : live?.valor ?? "—";

  const w = d.width ?? 130;
  const h = d.height ?? 56;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center rounded-md border-2 px-2 py-1 text-[11px] shadow-sm",
        statusCls,
        selected && "ring-2 ring-primary/50",
      )}
      style={{ width: w, height: h }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={90}
        minHeight={40}
        lineClassName="!border-primary"
        handleClassName="!h-2 !w-2 !bg-primary !border-primary"
      />
      <FourSideHandles />
      <div className="truncate font-mono text-[10px] text-muted-foreground">
        {d.label || d.tagNome || "(sem tag)"}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-base font-semibold tabular-nums">{valor}</span>
        <span className="text-[10px] text-muted-foreground">{live?.unidade ?? ""}</span>
      </div>
    </div>
  );
}

const nodeTypes = { equip: EquipNode, tag: TagNode };

// ---------- Editor ----------
function PfdEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [equipNome, setEquipNome] = useState("");
  const [nodes, setNodes] = useState<Node<AnyData>[]>([]);
  const [edges, setEdges] = useState<Edge<FlowEdgeData>[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Tags ao vivo (poll) — popula TagsLiveCtx para os TagNode lerem
  const tagsQ = useQuery({
    queryKey: ["pfd-tags-live"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live")
        .select("nome,valor,valor_num,unidade")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as TagLive[];
    },
    refetchInterval: 4000,
  });
  useEffect(() => {
    TagsLiveCtx.tags.clear();
    (tagsQ.data ?? []).forEach((t) => TagsLiveCtx.tags.set(t.nome, t));
  }, [tagsQ.data]);

  // Alertas (limites) — para colorir tag boxes
  const alertasQ = useQuery({
    queryKey: ["pfd-alertas-cfg"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas")
        .select("tag_nome,min_val,max_val,ativo,tipo")
        .eq("ativo", true)
        .eq("tipo", "tag_min_max");
      if (error) throw error;
      return (data ?? []) as AlertaCfg[];
    },
  });
  useEffect(() => {
    TagsLiveCtx.alertas.clear();
    (alertasQ.data ?? []).forEach((a) => {
      if (a.tag_nome) TagsLiveCtx.alertas.set(a.tag_nome, a);
    });
  }, [alertasQ.data]);

  // Carrega equipamento
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("nome,pfd_graph")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        toast.error(error?.message ?? "Equipamento não encontrado");
        navigate({ to: "/cadastros/equipamentos" });
        return;
      }
      setEquipNome(data.nome);
      const g = (data.pfd_graph as { nodes?: Node<AnyData>[]; edges?: Edge<FlowEdgeData>[] }) ?? {};
      // Rehydrate persisted size into React Flow's style prop so NodeResizer
      // restores the saved width/height on reload.
      const hydrated = (g.nodes ?? []).map((n) => {
        const w = (n.data as AnyData)?.width;
        const h = (n.data as AnyData)?.height;
        return w && h ? { ...n, style: { ...(n.style ?? {}), width: w, height: h } } : n;
      });
      setNodes(hydrated);
      setEdges(g.edges ?? []);
      setLoading(false);
    })();
  }, [id, navigate]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => {
      const next = applyNodeChanges(changes, nds) as Node<AnyData>[];
      // Persist NodeResizer dimensions into data so they survive save/reload.
      let touched = false;
      const synced = next.map((n) => {
        const styleW = (n.style?.width as number | undefined) ?? undefined;
        const styleH = (n.style?.height as number | undefined) ?? undefined;
        if (
          styleW && styleH &&
          ((n.data as AnyData)?.width !== styleW || (n.data as AnyData)?.height !== styleH)
        ) {
          touched = true;
          return { ...n, data: { ...n.data, width: styleW, height: styleH } as AnyData };
        }
        return n;
      });
      return touched ? synced : next;
    }),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds) as Edge<FlowEdgeData>[]),
    [],
  );
  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge({
      ...conn,
      id: crypto.randomUUID(),
      type: "default",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: FLUID_COLORS.produto },
      style: { stroke: FLUID_COLORS.produto, strokeWidth: 2 },
      label: "",
      data: { tipo: "produto", label: "" },
    }, eds) as Edge<FlowEdgeData>[]);
  }, []);

  // Edges renderizados com estilo do tipo
  const styledEdges = useMemo<Edge<FlowEdgeData>[]>(() => edges.map((e) => {
    const tipo = (e.data?.tipo ?? "produto") as FluidType;
    const color = FLUID_COLORS[tipo];
    return {
      ...e,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: { stroke: color, strokeWidth: 2 },
      label: e.data?.label ?? "",
      labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
      labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
    };
  }), [edges]);

  function addEquip(symbol: SymbolKind) {
    const n: Node<AnyData> = {
      id: crypto.randomUUID(),
      type: "equip",
      position: { x: 120 + nodes.length * 30, y: 120 + nodes.length * 20 },
      data: { kind: "equip", symbol, label: SYMBOL_LABEL[symbol], ativo: true },
    };
    setNodes((n0) => [...n0, n]);
    setSelectedNodeId(n.id);
    setSelectedEdgeId(null);
  }
  function addTag() {
    const n: Node<AnyData> = {
      id: crypto.randomUUID(),
      type: "tag",
      position: { x: 200 + nodes.length * 30, y: 200 + nodes.length * 20 },
      data: { kind: "tag", tagNome: "" },
    };
    setNodes((n0) => [...n0, n]);
    setSelectedNodeId(n.id);
    setSelectedEdgeId(null);
  }
  function deleteSelected() {
    if (selectedNodeId) {
      setNodes((ns) => ns.filter((x) => x.id !== selectedNodeId));
      setEdges((es) => es.filter((x) => x.source !== selectedNodeId && x.target !== selectedNodeId));
      setSelectedNodeId(null);
    }
    if (selectedEdgeId) {
      setEdges((es) => es.filter((x) => x.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }
  function updateNodeData(nodeId: string, patch: Partial<EquipNodeData> | Partial<TagNodeData>) {
    setNodes((ns) => ns.map((n) => n.id === nodeId
      ? { ...n, data: { ...n.data, ...patch } as AnyData }
      : n,
    ));
  }
  function updateEdgeData(edgeId: string, patch: Partial<FlowEdgeData>) {
    setEdges((es) => es.map((e) => e.id === edgeId
      ? { ...e, data: { ...(e.data ?? {}), ...patch } }
      : e,
    ));
  }

  async function save() {
    setSaving(true);
    const cleanNodes = nodes.map((n) => ({
      id: n.id, type: n.type, position: n.position, data: n.data,
    }));
    const cleanEdges = edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
      data: e.data ?? {},
    }));
    const { error } = await supabase
      .from("equipamentos")
      .update({ pfd_graph: { nodes: cleanNodes, edges: cleanEdges } as never })
      .eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Diagrama salvo");
  }

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((e) => e.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b p-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/cadastros/equipamentos"><ArrowLeft className="mr-1 size-4" /> Voltar</Link>
        </Button>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Diagrama PFD</span>
          <span className="text-sm font-semibold">{equipNome}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={deleteSelected}
            disabled={!selectedNodeId && !selectedEdgeId}>
            <Trash2 className="mr-1 size-4" /> Excluir seleção
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 size-4" /> {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Paleta */}
        <div className="flex w-56 flex-col gap-3 overflow-y-auto border-r bg-muted/30 p-3">
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">SÍMBOLOS ISA</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SYMBOL_LABEL) as SymbolKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => addEquip(k)}
                  className="flex flex-col items-center gap-1 rounded-md border bg-card p-2 text-[11px] hover:border-primary hover:bg-accent"
                  title={`Adicionar ${SYMBOL_LABEL[k]}`}
                >
                  <SymbolSvg kind={k} ativo={true} />
                  <span>{SYMBOL_LABEL[k]}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">TAG AO VIVO</p>
            <Button variant="outline" size="sm" className="w-full" onClick={addTag}>
              + Caixa de tag
            </Button>
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
              Conecte os símbolos arrastando das bolinhas das bordas. Clique em uma linha
              para definir tipo, cor e nome do fluxo.
            </p>
          </div>
        </div>

        {/* Canvas */}
        <div className="relative flex-1" ref={wrapperRef}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, n) => { setSelectedNodeId(n.id); setSelectedEdgeId(null); }}
              onEdgeClick={(_, e) => { setSelectedEdgeId(e.id); setSelectedNodeId(null); }}
              onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
              fitView
              deleteKeyCode={["Delete", "Backspace"]}
            >
              <Background gap={16} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </ReactFlowProvider>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-lg border bg-card/80 px-4 py-3 text-sm text-muted-foreground backdrop-blur">
              Adicione um símbolo na barra lateral para começar o diagrama.
            </div>
          )}
        </div>

        {/* Painel de propriedades */}
        {(selectedNode || selectedEdge) && (
          <div className="flex w-72 flex-col gap-3 overflow-y-auto border-l bg-card p-3">
            {selectedNode && selectedNode.type === "equip" && (
              <EquipPropsPanel
                node={selectedNode as Node<EquipNodeData>}
                onChange={(p) => updateNodeData(selectedNode.id, p)}
              />
            )}
            {selectedNode && selectedNode.type === "tag" && (
              <TagPropsPanel
                node={selectedNode as Node<TagNodeData>}
                tagOptions={(tagsQ.data ?? []).map((t) => ({ nome: t.nome, unidade: t.unidade }))}
                onChange={(p) => updateNodeData(selectedNode.id, p)}
              />
            )}
            {selectedEdge && (
              <EdgePropsPanel
                edge={selectedEdge}
                onChange={(p) => updateEdgeData(selectedEdge.id, p)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Painéis ----------
function EquipPropsPanel({
  node, onChange,
}: { node: Node<EquipNodeData>; onChange: (p: Partial<EquipNodeData>) => void }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase text-muted-foreground">Equipamento</p>
      <div>
        <Label className="text-xs">Símbolo</Label>
        <Select value={node.data.symbol} onValueChange={(v) => onChange({ symbol: v as SymbolKind })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SYMBOL_LABEL) as SymbolKind[]).map((k) => (
              <SelectItem key={k} value={k}>{SYMBOL_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Nome / etiqueta</Label>
        <Input value={node.data.label} onChange={(e) => onChange({ label: e.target.value })} />
      </div>
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <Label className="text-xs">Ativo</Label>
        <Switch checked={node.data.ativo} onCheckedChange={(v) => onChange({ ativo: v })} />
      </div>
    </>
  );
}

function TagPropsPanel({
  node, onChange, tagOptions,
}: {
  node: Node<TagNodeData>;
  onChange: (p: Partial<TagNodeData>) => void;
  tagOptions: { nome: string; unidade: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="text-xs font-semibold uppercase text-muted-foreground">Caixa de tag</p>
      <div>
        <Label className="text-xs">Tag associada</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-mono text-xs">
              {node.data.tagNome || "Selecione..."}
              <ChevronsUpDown className="ml-2 size-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar tag..." />
              <CommandList>
                <CommandEmpty>Nenhuma tag encontrada.</CommandEmpty>
                <CommandGroup>
                  {tagOptions.map((t) => (
                    <CommandItem
                      key={t.nome}
                      value={t.nome}
                      onSelect={() => { onChange({ tagNome: t.nome }); setOpen(false); }}
                    >
                      <Check className={cn(
                        "mr-2 size-3",
                        node.data.tagNome === t.nome ? "opacity-100" : "opacity-0",
                      )} />
                      <span className="font-mono text-xs">{t.nome}</span>
                      {t.unidade && <span className="ml-auto text-[10px] text-muted-foreground">{t.unidade}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <Label className="text-xs">Rótulo (opcional)</Label>
        <Input value={node.data.label ?? ""} onChange={(e) => onChange({ label: e.target.value })}
          placeholder="ex: Temperatura" />
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Status colore a caixa: verde = ok, vermelho = fora dos limites (configurados em
        Alertas), âmbar = sem leitura recente.
      </p>
    </>
  );
}

function EdgePropsPanel({
  edge, onChange,
}: { edge: Edge<FlowEdgeData>; onChange: (p: Partial<FlowEdgeData>) => void }) {
  const tipo = (edge.data?.tipo ?? "produto") as FluidType;
  return (
    <>
      <p className="text-xs font-semibold uppercase text-muted-foreground">Linha de fluxo</p>
      <div>
        <Label className="text-xs">Tipo / fluido</Label>
        <Select value={tipo} onValueChange={(v) => onChange({ tipo: v as FluidType })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(FLUID_LABEL) as FluidType[]).map((k) => (
              <SelectItem key={k} value={k}>
                <span className="flex items-center gap-2">
                  <span className="inline-block size-3 rounded-sm" style={{ background: FLUID_COLORS[k] }} />
                  {FLUID_LABEL[k]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Nome da linha</Label>
        <Input value={edge.data?.label ?? ""} onChange={(e) => onChange({ label: e.target.value })}
          placeholder="ex: Vapor saturado 8 bar" />
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Linhas têm seta indicando o sentido do fluxo (da origem para o destino).
      </p>
    </>
  );
}
