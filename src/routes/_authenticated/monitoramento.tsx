import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import GridLayout, { type Layout, type LayoutItem } from "react-grid-layout";


import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Settings as SettingsIcon, LineChart as LineIcon,
  BarChart3, Gauge as GaugeIcon, Hash, X, Pencil, LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/monitoramento")({
  head: pageHead({ title: "Monitoramento — STHApc", description: "Acesse e gerencie Monitoramento no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: "/monitoramento" }),
  component: MonitoramentoPage,
});

// ---------- Types ----------
type WidgetType = "line" | "bar" | "gauge" | "value";
type TagBinding = { nome: string; cor: string; label?: string };
type WidgetConfig = {
  min?: number;
  max?: number;
  unidade?: string;
  xLabel?: string;
  yLabel?: string;
  decimals?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  pontos?: number; // janela de pontos para tendência
};
type WidgetLayout = { x: number; y: number; w: number; h: number };

type Dashboard = {
  id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
};
type Widget = {
  id: string;
  dashboard_id: string;
  titulo: string;
  tipo: WidgetType;
  tags: TagBinding[];
  config: WidgetConfig;
  layout: WidgetLayout;
};
type TagRow = {
  nome: string;
  valor: string | null;
  valor_num: number | null;
  unidade: string | null;
  grupo: string | null;
  atualizado_em: string;
};

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];
const COLS = 12;
const ROW_H = 60;

// ---------- Histórico em memória (tempo real) ----------
type HistoryPoint = { t: number; v: number };
const HISTORY_LIMIT = 240; // ~8 min @ 2s

function useTagHistory(tags: TagRow[] | undefined) {
  const historyRef = useRef<Map<string, HistoryPoint[]>>(new Map());
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!tags) return;
    const map = historyRef.current;
    const now = Date.now();
    for (const t of tags) {
      if (t.valor_num == null) continue;
      const list = map.get(t.nome) ?? [];
      const last = list[list.length - 1];
      if (!last || last.t !== now) {
        list.push({ t: now, v: t.valor_num });
        if (list.length > HISTORY_LIMIT) list.splice(0, list.length - HISTORY_LIMIT);
        map.set(t.nome, list);
      }
    }
    forceRender((n) => n + 1);
  }, [tags]);

  return historyRef.current;
}

// ---------- Page ----------
function MonitoramentoPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [newWidgetOpen, setNewWidgetOpen] = useState(false);
  const [newDashOpen, setNewDashOpen] = useState(false);

  const dashboards = useQuery({
    queryKey: ["monitoring_dashboards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoring_dashboards" as never)
        .select("*")
        .order("ordem")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Dashboard[];
    },
  });

  useEffect(() => {
    if (!activeId && dashboards.data && dashboards.data.length > 0) {
      setActiveId(dashboards.data[0].id);
    }
  }, [dashboards.data, activeId]);

  const widgets = useQuery({
    queryKey: ["monitoring_widgets", activeId],
    queryFn: async () => {
      if (!activeId) return [];
      const { data, error } = await supabase
        .from("monitoring_widgets" as never)
        .select("*")
        .eq("dashboard_id", activeId);
      if (error) throw error;
      return (data ?? []) as unknown as Widget[];
    },
    enabled: !!activeId,
  });

  const tagsLive = useQuery({
    queryKey: ["tags-live"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live" as never)
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as TagRow[];
    },
    refetchInterval: 2000,
  });

  const history = useTagHistory(tagsLive.data);
  const tagsByName = useMemo(() => {
    const m = new Map<string, TagRow>();
    for (const t of tagsLive.data ?? []) m.set(t.nome, t);
    return m;
  }, [tagsLive.data]);

  const createDash = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase
        .from("monitoring_dashboards" as never)
        .insert({ nome, ordem: (dashboards.data?.length ?? 0) } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Dashboard;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["monitoring_dashboards"] });
      setActiveId(d.id);
      setNewDashOpen(false);
      toast.success("Painel criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDash = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monitoring_dashboards" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitoring_dashboards"] });
      setActiveId(null);
      toast.success("Painel removido");
    },
    onError: async (e: Error) => {
      toast.error(e.message);
    },
  });

  const saveWidget = useMutation({
    mutationFn: async (w: Partial<Widget> & { id?: string; dashboard_id: string }) => {
      if (w.id) {
        const { error } = await supabase
          .from("monitoring_widgets" as never)
          .update({
            titulo: w.titulo, tipo: w.tipo, tags: w.tags, config: w.config, layout: w.layout,
          } as never)
          .eq("id", w.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("monitoring_widgets" as never)
          .insert({
            dashboard_id: w.dashboard_id,
            titulo: w.titulo, tipo: w.tipo, tags: w.tags, config: w.config, layout: w.layout,
          } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitoring_widgets", activeId] });
      setEditingWidget(null);
      setNewWidgetOpen(false);
    },
    onError: async (e: Error) => {
      toast.error(e.message);
    },
  });

  const deleteWidget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monitoring_widgets" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitoring_widgets", activeId] }),
    onError: async (e: Error) => {
      toast.error(e.message);
    },
  });

  const updateLayouts = useMutation({
    mutationFn: async (items: { id: string; layout: WidgetLayout }[]) => {
      await Promise.all(
        items.map((it) =>
          supabase.from("monitoring_widgets" as never).update({ layout: it.layout } as never).eq("id", it.id),
        ),
      );
    },
  });

  const handleLayoutChange = (next: readonly LayoutItem[]) => {
    if (!widgets.data) return;
    const changed: { id: string; layout: WidgetLayout }[] = [];
    for (const l of next) {
      const w = widgets.data.find((x) => x.id === l.i);
      if (!w) continue;
      const cur = w.layout;
      if (cur.x !== l.x || cur.y !== l.y || cur.w !== l.w || cur.h !== l.h) {
        changed.push({ id: w.id, layout: { x: l.x, y: l.y, w: l.w, h: l.h } });
      }
    }
    if (changed.length) updateLayouts.mutate(changed);
  };

  const active = dashboards.data?.find((d) => d.id === activeId) ?? null;
  const tagsLista = tagsLive.data ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Monitoramento"
        description="Centro de excelência operacional — crie painéis, gráficos e indicadores em tempo real."
        actions={

          <Dialog open={newDashOpen} onOpenChange={setNewDashOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo painel</Button>
            </DialogTrigger>
            <NewDashboardDialog onCreate={(nome) => createDash.mutate(nome)} loading={createDash.isPending} />
          </Dialog>
        }
      />

      {dashboards.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando painéis...</div>
      ) : !dashboards.data || dashboards.data.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-6 w-6" />}

          title="Nenhum painel ainda"
          description="Crie seu primeiro painel para começar a montar gráficos e widgets das tags recebidas."
          action={<Button onClick={() => setNewDashOpen(true)}><Plus className="mr-2 h-4 w-4" />Criar painel</Button>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={activeId ?? ""} onValueChange={setActiveId}>
              <TabsList className="flex-wrap">
                {dashboards.data.map((d) => (
                  <TabsTrigger key={d.id} value={d.id}>{d.nome}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {active && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ao vivo · {tagsLista.length} tags
                </Badge>
                <Dialog open={newWidgetOpen} onOpenChange={setNewWidgetOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="mr-2 h-4 w-4" />Novo widget</Button>
                  </DialogTrigger>
                  <WidgetDialog
                    key={`new-${active.id}`}
                    open={newWidgetOpen}
                    tags={tagsLista}
                    onSave={(payload) => saveWidget.mutate({ ...payload, dashboard_id: active.id })}
                    loading={saveWidget.isPending}
                  />
                </Dialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir painel "{active.nome}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Todos os widgets deste painel serão removidos. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground"
                        onClick={() => deleteDash.mutate(active.id)}
                      >Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>

          {active && (
            <DashboardGrid
              widgets={widgets.data ?? []}
              history={history}
              tagsByName={tagsByName}
              onEdit={setEditingWidget}
              onDelete={(id) => deleteWidget.mutate(id)}
              onLayoutChange={handleLayoutChange}
            />
          )}
        </>
      )}

      {editingWidget && (
        <Dialog open onOpenChange={(o) => !o && setEditingWidget(null)}>
          <WidgetDialog
            key={editingWidget.id}
            open
            initial={editingWidget}
            tags={tagsLista}
            onSave={(payload) =>
              saveWidget.mutate({ ...payload, id: editingWidget.id, dashboard_id: editingWidget.dashboard_id })
            }
            loading={saveWidget.isPending}
          />
        </Dialog>
      )}
    </div>
  );
}

// ---------- Dashboard Grid ----------
function DashboardGrid({
  widgets, history, tagsByName, onEdit, onDelete, onLayoutChange,
}: {
  widgets: Widget[];
  history: Map<string, HistoryPoint[]>;
  tagsByName: Map<string, TagRow>;
  onEdit: (w: Widget) => void;
  onDelete: (id: string) => void;
  onLayoutChange: (l: readonly LayoutItem[]) => void;
}) {
  const [width, setWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (widgets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Painel vazio. Clique em <span className="font-semibold">Novo widget</span> para adicionar gráficos e indicadores.
        </CardContent>
      </Card>
    );
  }

  const layout: LayoutItem[] = widgets.map((w) => ({
    i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, minW: 2, minH: 2,
  }));

  return (
    <div ref={containerRef} className="w-full">
      <GridLayout
        className="layout"
        layout={layout as unknown as Layout}
        width={width}
        gridConfig={{ cols: COLS, rowHeight: ROW_H, margin: [12, 12] }}
        dragConfig={{ handle: ".widget-drag" }}
        onLayoutChange={onLayoutChange as (l: Layout) => void}
      >
        {widgets.map((w) => (
          <div key={w.id}>
            <WidgetCard
              widget={w}
              history={history}
              tagsByName={tagsByName}
              onEdit={() => onEdit(w)}
              onDelete={() => onDelete(w.id)}
            />
          </div>
        ))}
      </GridLayout>
    </div>
  );
}


// ---------- Widget Card ----------
function WidgetCard({
  widget, history, tagsByName, onEdit, onDelete,
}: {
  widget: Widget;
  history: Map<string, HistoryPoint[]>;
  tagsByName: Map<string, TagRow>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="widget-drag cursor-move flex-row items-center justify-between space-y-0 py-2.5 px-3 border-b">
        <CardTitle className="text-sm font-semibold truncate">{widget.titulo}</CardTitle>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-3">
        <WidgetRenderer widget={widget} history={history} tagsByName={tagsByName} />
      </CardContent>
    </Card>
  );
}

function WidgetRenderer({
  widget, history, tagsByName,
}: { widget: Widget; history: Map<string, HistoryPoint[]>; tagsByName: Map<string, TagRow> }) {
  const cfg = widget.config ?? {};
  if (widget.tags.length === 0) {
    return <div className="h-full grid place-items-center text-xs text-muted-foreground">Nenhuma tag configurada</div>;
  }

  if (widget.tipo === "value") {
    return <ValueWidget widget={widget} tagsByName={tagsByName} />;
  }

  if (widget.tipo === "gauge") {
    return <GaugeWidget widget={widget} tagsByName={tagsByName} />;
  }

  // line / bar — series histórica
  const limit = Math.max(5, Math.min(HISTORY_LIMIT, cfg.pontos ?? 60));
  // Merge timestamps em janela
  const allTimes = new Set<number>();
  for (const t of widget.tags) {
    const h = history.get(t.nome) ?? [];
    for (const p of h.slice(-limit)) allTimes.add(p.t);
  }
  const times = Array.from(allTimes).sort((a, b) => a - b).slice(-limit);
  const lastByTag: Record<string, Map<number, number>> = {};
  for (const t of widget.tags) {
    const m = new Map<number, number>();
    for (const p of history.get(t.nome) ?? []) m.set(p.t, p.v);
    lastByTag[t.nome] = m;
  }
  let lastVals: Record<string, number | null> = {};
  for (const t of widget.tags) lastVals[t.nome] = null;
  const data = times.map((t) => {
    const row: Record<string, number | string | null> = {
      t,
      time: new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
    for (const tag of widget.tags) {
      const v = lastByTag[tag.nome].get(t);
      if (v != null) lastVals[tag.nome] = v;
      row[tag.nome] = lastVals[tag.nome];
    }
    return row;
  });

  const showGrid = cfg.showGrid ?? true;
  const showLegend = cfg.showLegend ?? true;
  const yDomain: [number | "auto", number | "auto"] = [
    cfg.min ?? "auto", cfg.max ?? "auto",
  ];

  if (widget.tipo === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
          <XAxis dataKey="time" fontSize={10} label={cfg.xLabel ? { value: cfg.xLabel, position: "insideBottom", offset: -2, fontSize: 11 } : undefined} />
          <YAxis fontSize={10} domain={yDomain} label={cfg.yLabel ? { value: cfg.yLabel, angle: -90, position: "insideLeft", fontSize: 11 } : undefined} unit={cfg.unidade ?? ""} />
          <Tooltip />
          {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {widget.tags.map((t) => (
            <Bar key={t.nome} dataKey={t.nome} name={t.label || t.nome} fill={t.cor} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
        <XAxis dataKey="time" fontSize={10} label={cfg.xLabel ? { value: cfg.xLabel, position: "insideBottom", offset: -2, fontSize: 11 } : undefined} />
        <YAxis fontSize={10} domain={yDomain} label={cfg.yLabel ? { value: cfg.yLabel, angle: -90, position: "insideLeft", fontSize: 11 } : undefined} unit={cfg.unidade ?? ""} />
        <Tooltip />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {widget.tags.map((t) => (
          <Line key={t.nome} type="monotone" dataKey={t.nome} name={t.label || t.nome} stroke={t.cor} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function ValueWidget({ widget, tagsByName }: { widget: Widget; tagsByName: Map<string, TagRow> }) {
  const cfg = widget.config ?? {};
  const decimals = cfg.decimals ?? 2;
  return (
    <div className="h-full grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(widget.tags.length, 2)}, 1fr)` }}>
      {widget.tags.map((t) => {
        const tag = tagsByName.get(t.nome);
        const v = tag?.valor_num;
        return (
          <div key={t.nome} className="flex flex-col justify-center items-center text-center rounded-lg p-2"
               style={{ background: `${t.cor}10`, border: `1px solid ${t.cor}30` }}>
            <div className="text-xs text-muted-foreground truncate w-full">{t.label || t.nome}</div>
            <div className="text-2xl md:text-3xl font-bold tabular-nums" style={{ color: t.cor }}>
              {v != null ? v.toFixed(decimals) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground">{cfg.unidade || tag?.unidade || ""}</div>
          </div>
        );
      })}
    </div>
  );
}

function GaugeWidget({ widget, tagsByName }: { widget: Widget; tagsByName: Map<string, TagRow> }) {
  const cfg = widget.config ?? {};
  const min = cfg.min ?? 0;
  const max = cfg.max ?? 100;
  const decimals = cfg.decimals ?? 1;
  const t = widget.tags[0];
  const tag = tagsByName.get(t.nome);
  const v = tag?.valor_num ?? min;
  const clamped = Math.max(min, Math.min(max, v));
  const data = [{ name: t.nome, value: clamped, fill: t.cor }];
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="65%" outerRadius="100%" data={data} startAngle={220} endAngle={-40}>
            <PolarAngleAxis type="number" domain={[min, max]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "hsl(var(--muted))" }} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center -mt-8">
        <div className="text-2xl font-bold tabular-nums" style={{ color: t.cor }}>
          {tag?.valor_num != null ? tag.valor_num.toFixed(decimals) : "—"}
          <span className="text-xs text-muted-foreground ml-1">{cfg.unidade || tag?.unidade || ""}</span>
        </div>
        <div className="text-[10px] text-muted-foreground">{t.label || t.nome} · {min} – {max}</div>
      </div>
    </div>
  );
}

// ---------- Dialogs ----------
function NewDashboardDialog({ onCreate, loading }: { onCreate: (n: string) => void; loading: boolean }) {
  const [nome, setNome] = useState("");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo painel de monitoramento</DialogTitle>
        <DialogDescription>Dê um nome para organizar seus widgets.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Linha 1 — Excelência operacional" autoFocus />
      </div>
      <DialogFooter>
        <Button disabled={!nome.trim() || loading} onClick={() => onCreate(nome.trim())}>Criar painel</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function WidgetDialog({
  open, initial, tags, onSave, loading,
}: {
  open: boolean;
  initial?: Widget;
  tags: TagRow[];
  onSave: (w: { titulo: string; tipo: WidgetType; tags: TagBinding[]; config: WidgetConfig; layout: WidgetLayout }) => void;
  loading: boolean;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [tipo, setTipo] = useState<WidgetType>(initial?.tipo ?? "line");
  const [bindings, setBindings] = useState<TagBinding[]>(initial?.tags ?? []);
  const [cfg, setCfg] = useState<WidgetConfig>(initial?.config ?? { showGrid: true, showLegend: true, pontos: 60, decimals: 2 });
  const [tagToAdd, setTagToAdd] = useState<string>("");

  useEffect(() => {
    if (open) {
      setTitulo(initial?.titulo ?? "");
      setTipo(initial?.tipo ?? "line");
      setBindings(initial?.tags ?? []);
      setCfg(initial?.config ?? { showGrid: true, showLegend: true, pontos: 60, decimals: 2 });
    }
  }, [open, initial]);

  const addTag = () => {
    if (!tagToAdd) return;
    if (bindings.some((b) => b.nome === tagToAdd)) return;
    const cor = PALETTE[bindings.length % PALETTE.length];
    setBindings([...bindings, { nome: tagToAdd, cor }]);
    setTagToAdd("");
  };

  const canSave = titulo.trim() && bindings.length > 0 && (tipo !== "gauge" || bindings.length === 1);

  const submit = () => {
    if (!canSave) return;
    onSave({
      titulo: titulo.trim(),
      tipo,
      tags: bindings,
      config: cfg,
      layout: initial?.layout ?? defaultLayoutFor(tipo),
    });
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar widget" : "Novo widget"}</DialogTitle>
        <DialogDescription>Configure tipo, tags monitoradas, cores e eixos.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Temperatura Reator" />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as WidgetType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="line"><div className="flex items-center gap-2"><LineIcon className="h-3.5 w-3.5" /> Linha (tendência)</div></SelectItem>
                <SelectItem value="bar"><div className="flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5" /> Barras</div></SelectItem>
                <SelectItem value="gauge"><div className="flex items-center gap-2"><GaugeIcon className="h-3.5 w-3.5" /> Gauge / Medidor</div></SelectItem>
                <SelectItem value="value"><div className="flex items-center gap-2"><Hash className="h-3.5 w-3.5" /> Card de valor</div></SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>Tags monitoradas {tipo === "gauge" && <span className="text-xs text-muted-foreground">(o gauge usa apenas 1 tag)</span>}</Label>
          <div className="flex gap-2">
            <Select value={tagToAdd} onValueChange={setTagToAdd}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione uma tag..." /></SelectTrigger>
              <SelectContent>
                {tags.filter((t) => !bindings.some((b) => b.nome === t.nome)).map((t) => (
                  <SelectItem key={t.nome} value={t.nome}>
                    {t.nome} {t.grupo ? <span className="text-xs text-muted-foreground">· {t.grupo}</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={addTag} disabled={!tagToAdd || (tipo === "gauge" && bindings.length >= 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1.5">
            {bindings.map((b, i) => (
              <div key={b.nome} className="flex items-center gap-2 rounded-md border bg-card p-2">
                <input
                  type="color"
                  value={b.cor}
                  onChange={(e) => setBindings(bindings.map((x, idx) => idx === i ? { ...x, cor: e.target.value } : x))}
                  className="h-8 w-10 rounded cursor-pointer border bg-transparent"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{b.nome}</div>
                  <Input
                    className="h-7 text-xs mt-1"
                    placeholder="Rótulo personalizado (opcional)"
                    value={b.label ?? ""}
                    onChange={(e) => setBindings(bindings.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                  />
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0"
                  onClick={() => setBindings(bindings.filter((_, idx) => idx !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {bindings.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-md">
                Nenhuma tag adicionada
              </div>
            )}
          </div>
        </div>

        {/* Config */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
          {(tipo === "line" || tipo === "bar" || tipo === "gauge") && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Mín. eixo Y</Label>
                <Input type="number" value={cfg.min ?? ""} onChange={(e) => setCfg({ ...cfg, min: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="auto" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Máx. eixo Y</Label>
                <Input type="number" value={cfg.max ?? ""} onChange={(e) => setCfg({ ...cfg, max: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="auto" />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Unidade</Label>
            <Input value={cfg.unidade ?? ""} onChange={(e) => setCfg({ ...cfg, unidade: e.target.value })} placeholder="°C, %, bar..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Decimais</Label>
            <Input type="number" min={0} max={6} value={cfg.decimals ?? 2} onChange={(e) => setCfg({ ...cfg, decimals: Number(e.target.value) })} />
          </div>
          {(tipo === "line" || tipo === "bar") && (
            <>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Rótulo eixo X</Label>
                <Input value={cfg.xLabel ?? ""} onChange={(e) => setCfg({ ...cfg, xLabel: e.target.value })} placeholder="Tempo" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Rótulo eixo Y</Label>
                <Input value={cfg.yLabel ?? ""} onChange={(e) => setCfg({ ...cfg, yLabel: e.target.value })} placeholder="Valor" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Janela (pontos)</Label>
                <Input type="number" min={5} max={HISTORY_LIMIT} value={cfg.pontos ?? 60}
                  onChange={(e) => setCfg({ ...cfg, pontos: Number(e.target.value) })} />
              </div>
              <div className="flex items-center justify-between col-span-2 rounded-md border px-3 py-2">
                <Label className="text-xs">Mostrar grade</Label>
                <Switch checked={cfg.showGrid ?? true} onCheckedChange={(v) => setCfg({ ...cfg, showGrid: v })} />
              </div>
              <div className="flex items-center justify-between col-span-2 rounded-md border px-3 py-2">
                <Label className="text-xs">Mostrar legenda</Label>
                <Switch checked={cfg.showLegend ?? true} onCheckedChange={(v) => setCfg({ ...cfg, showLegend: v })} />
              </div>
            </>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button onClick={submit} disabled={!canSave || loading}>
          <SettingsIcon className="mr-2 h-4 w-4" />
          {initial ? "Salvar alterações" : "Adicionar widget"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function defaultLayoutFor(tipo: WidgetType): WidgetLayout {
  if (tipo === "value") return { x: 0, y: 0, w: 3, h: 3 };
  if (tipo === "gauge") return { x: 0, y: 0, w: 4, h: 5 };
  return { x: 0, y: 0, w: 6, h: 5 };
}
