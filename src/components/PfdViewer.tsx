import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

type SymbolKind =
  | "tanque" | "bomba" | "trocador" | "valvula" | "reator"
  | "coluna" | "compressor" | "filtro" | "vaso" | "misturador";

type EquipNodeData = { kind: "equip"; symbol: SymbolKind; label: string; ativo: boolean };
type TagNodeData = { kind: "tag"; tagNome: string; label?: string };
type AnyData = EquipNodeData | TagNodeData;

type FluidType = "produto" | "vapor" | "agua" | "ar" | "condensado" | "gas" | "quimico" | "outro";
type FlowEdgeData = { label?: string; tipo?: FluidType };

const FLUID_COLORS: Record<FluidType, string> = {
  produto: "#10b981", vapor: "#f97316", agua: "#3b82f6", ar: "#64748b",
  condensado: "#0ea5e9", gas: "#eab308", quimico: "#a855f7", outro: "#94a3b8",
};

const SYMBOL_LABEL: Record<SymbolKind, string> = {
  tanque: "Tanque", bomba: "Bomba", trocador: "Trocador", valvula: "Válvula",
  reator: "Reator", coluna: "Coluna", compressor: "Compressor", filtro: "Filtro",
  vaso: "Vaso", misturador: "Misturador",
};

function SymbolSvg({ kind, ativo }: { kind: SymbolKind; ativo: boolean }) {
  const stroke = ativo ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))";
  const fill = ativo ? "hsl(var(--card))" : "hsl(var(--muted))";
  const sw = 2;
  const common = { stroke, strokeWidth: sw, fill };
  switch (kind) {
    case "tanque": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><rect x="14" y="14" width="52" height="52" rx="6" {...common} /><line x1="14" y1="28" x2="66" y2="28" stroke={stroke} strokeWidth={1} /></svg>);
    case "vaso": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><path d="M20 22 Q40 6 60 22 L60 58 Q40 74 20 58 Z" {...common} /></svg>);
    case "bomba": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><circle cx="40" cy="40" r="22" {...common} /><path d="M40 18 L62 40 L40 40 Z" fill={stroke} /></svg>);
    case "compressor": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><circle cx="40" cy="40" r="22" {...common} /><path d="M22 22 L58 58 M22 58 L58 22" stroke={stroke} strokeWidth={sw} fill="none" /></svg>);
    case "trocador": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><circle cx="40" cy="40" r="24" {...common} /><path d="M20 30 Q30 40 20 50 M30 30 Q40 40 30 50 M40 30 Q50 40 40 50 M50 30 Q60 40 50 50" stroke={stroke} strokeWidth={sw} fill="none" /></svg>);
    case "valvula": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><path d="M14 22 L40 40 L14 58 Z M66 22 L40 40 L66 58 Z" {...common} /></svg>);
    case "reator": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><rect x="20" y="18" width="40" height="44" rx="20" {...common} /><line x1="40" y1="14" x2="40" y2="38" stroke={stroke} strokeWidth={sw} /><path d="M34 38 L46 38 L40 48 Z" fill={stroke} /></svg>);
    case "coluna": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><rect x="30" y="8" width="20" height="64" rx="10" {...common} /><line x1="30" y1="22" x2="50" y2="22" stroke={stroke} /><line x1="30" y1="34" x2="50" y2="34" stroke={stroke} /><line x1="30" y1="46" x2="50" y2="46" stroke={stroke} /><line x1="30" y1="58" x2="50" y2="58" stroke={stroke} /></svg>);
    case "filtro": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><path d="M16 18 L64 18 L48 40 L48 64 L32 64 L32 40 Z" {...common} /></svg>);
    case "misturador": return (<svg viewBox="0 0 80 80" className="h-16 w-16"><rect x="16" y="18" width="48" height="44" rx="4" {...common} /><line x1="40" y1="10" x2="40" y2="34" stroke={stroke} strokeWidth={sw} /><path d="M28 34 L52 34 M30 42 L50 42" stroke={stroke} strokeWidth={sw} /></svg>);
  }
}

type TagLive = { nome: string; valor: string | null; valor_num: number | null; unidade: string | null };
type AlertaCfg = { tag_nome: string; min_val: number | null; max_val: number | null };
const TagsLiveCtx = { tags: new Map<string, TagLive>(), alertas: new Map<string, AlertaCfg>() };

function EquipNode({ data }: NodeProps) {
  const d = data as unknown as EquipNodeData;
  return (
    <div className={cn("flex flex-col items-center rounded-md border-2 border-border bg-card/80 px-2 py-1 shadow-sm backdrop-blur", !d.ativo && "opacity-60")}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-primary" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-primary" />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-primary" />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-primary" />
      <SymbolSvg kind={d.symbol} ativo={d.ativo} />
      <div className="mt-1 max-w-[120px] truncate text-center text-xs font-medium">{d.label || SYMBOL_LABEL[d.symbol]}</div>
      {!d.ativo && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">inativo</div>}
    </div>
  );
}

function TagNode({ data }: NodeProps) {
  const d = data as unknown as TagNodeData;
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(i); }, []);
  const live = TagsLiveCtx.tags.get(d.tagNome);
  const al = TagsLiveCtx.alertas.get(d.tagNome);
  let status: "ok" | "warn" | "alert" | "none" = "none";
  if (live?.valor_num != null && al) {
    status = (al.min_val != null && live.valor_num < al.min_val) || (al.max_val != null && live.valor_num > al.max_val) ? "alert" : "ok";
  } else if (live?.valor_num != null) status = "ok";
  else if (d.tagNome) status = "warn";
  const statusCls = {
    ok: "border-emerald-500/60 bg-emerald-500/10",
    warn: "border-amber-500/60 bg-amber-500/10",
    alert: "border-red-500/70 bg-red-500/15 animate-pulse",
    none: "border-border bg-card",
  }[status];
  const valor = live?.valor_num != null ? live.valor_num.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : live?.valor ?? "—";
  return (
    <div className={cn("min-w-[110px] rounded-md border-2 px-2 py-1 text-[11px] shadow-sm", statusCls)}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-primary" />
      <div className="truncate font-mono text-[10px] text-muted-foreground">{d.label || d.tagNome || "(sem tag)"}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-base font-semibold tabular-nums">{valor}</span>
        <span className="text-[10px] text-muted-foreground">{live?.unidade ?? ""}</span>
      </div>
    </div>
  );
}

const nodeTypes = { equip: EquipNode, tag: TagNode };

export function PfdViewer({ equipamentoId }: { equipamentoId: string }) {
  const equip = useQuery({
    queryKey: ["pfd-viewer-equip", equipamentoId],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("pfd_graph").eq("id", equipamentoId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const tagsQ = useQuery({
    queryKey: ["pfd-viewer-tags-live"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags_live").select("nome,valor,valor_num,unidade");
      if (error) throw error;
      return (data ?? []) as TagLive[];
    },
    refetchInterval: 4000,
  });
  useEffect(() => {
    TagsLiveCtx.tags.clear();
    (tagsQ.data ?? []).forEach((t) => TagsLiveCtx.tags.set(t.nome, t));
  }, [tagsQ.data]);

  const alertasQ = useQuery({
    queryKey: ["pfd-viewer-alertas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("alertas").select("tag_nome,min_val,max_val,ativo,tipo").eq("ativo", true).eq("tipo", "tag_min_max");
      if (error) throw error;
      return (data ?? []) as AlertaCfg[];
    },
  });
  useEffect(() => {
    TagsLiveCtx.alertas.clear();
    (alertasQ.data ?? []).forEach((a) => { if (a.tag_nome) TagsLiveCtx.alertas.set(a.tag_nome, a); });
  }, [alertasQ.data]);

  const graph = (equip.data?.pfd_graph as { nodes?: Node<AnyData>[]; edges?: Edge<FlowEdgeData>[] }) ?? {};
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];

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

  if (equip.isLoading) return null;
  if (nodes.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="h-4 w-4" /> Diagrama PFD
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[420px] w-full overflow-hidden rounded-md border">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              nodeTypes={nodeTypes}
              fitView
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              edgesFocusable={false}
              nodesFocusable={false}
              panOnDrag
              zoomOnScroll
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </CardContent>
    </Card>
  );
}
