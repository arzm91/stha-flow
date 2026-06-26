import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import GridLayout, { type Layout, type LayoutItem } from "react-grid-layout";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pencil, Plus, Trash2, X, ArrowLeft, LayoutGrid, RotateCcw,
  TrendingUp, BarChart3, Hash, PieChart as PieIcon, Table as TableIcon, GitCompare,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatInt, formatDuration } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/producao/dashboard")({
  component: ProducaoDashboardPage,
});

// ---------- Types ----------
type WidgetKind =
  | "kpi-total-ops"
  | "kpi-produzido"
  | "kpi-eficiencia"
  | "kpi-tempo-medio"
  | "chart-line-tempo"
  | "chart-bar-equipamento"
  | "chart-status"
  | "table-top-ops"
  | "compare-equip";

type WidgetInstance = {
  id: string;
  kind: WidgetKind;
  title: string;
  layout: { x: number; y: number; w: number; h: number };
};

type Turno = "todos" | "A" | "B" | "C" | "D";

type Filters = {
  preset: "hoje" | "7d" | "30d" | "mes" | "custom";
  de: string;        // YYYY-MM-DD
  ate: string;
  equipIds: string[];
  produtoId: string; // "" = todos
  ordemId: string;   // "" = todas
  turno: Turno;
};

// ---------- Constants ----------
const COLS = 12;
const ROW_H = 60;
const STORAGE_KEY = (uid: string) => `prod-dashboard:${uid}`;

const TURNO_WINDOWS: Record<Exclude<Turno, "todos">, [number, number]> = {
  A: [0, 6], B: [6, 12], C: [12, 18], D: [18, 24],
};

const WIDGET_CATALOG: { kind: WidgetKind; title: string; icon: any; defaultSize: { w: number; h: number }; desc: string }[] = [
  { kind: "kpi-total-ops",       title: "KPI · Total de ordens",        icon: Hash,        defaultSize: { w: 3, h: 3 }, desc: "Contagem de ordens no período" },
  { kind: "kpi-produzido",       title: "KPI · Quantidade produzida",   icon: Hash,        defaultSize: { w: 3, h: 3 }, desc: "Soma de qtd. produzida" },
  { kind: "kpi-eficiencia",      title: "KPI · Eficiência",             icon: Hash,        defaultSize: { w: 3, h: 3 }, desc: "Produzido / Planejado" },
  { kind: "kpi-tempo-medio",     title: "KPI · Tempo médio (finalizadas)", icon: Hash,     defaultSize: { w: 3, h: 3 }, desc: "Duração média das OPs finalizadas" },
  { kind: "chart-line-tempo",    title: "Produção ao longo do tempo",   icon: TrendingUp,  defaultSize: { w: 8, h: 6 }, desc: "Linha por dia (uma série por equipamento)" },
  { kind: "chart-bar-equipamento", title: "Produção por equipamento",   icon: BarChart3,   defaultSize: { w: 6, h: 6 }, desc: "Barras com total por equipamento" },
  { kind: "chart-status",        title: "Distribuição por status",      icon: PieIcon,     defaultSize: { w: 4, h: 6 }, desc: "Pizza com status das ordens" },
  { kind: "table-top-ops",       title: "Top ordens de produção",       icon: TableIcon,   defaultSize: { w: 8, h: 7 }, desc: "Lista detalhada de ordens" },
  { kind: "compare-equip",       title: "Comparar equipamentos",        icon: GitCompare,  defaultSize: { w: 12, h: 6 }, desc: "Cards lado a lado por equipamento" },
];

const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: "w1", kind: "kpi-total-ops",        title: "Total de ordens",    layout: { x: 0, y: 0, w: 3, h: 3 } },
  { id: "w2", kind: "kpi-produzido",        title: "Quantidade produzida", layout: { x: 3, y: 0, w: 3, h: 3 } },
  { id: "w3", kind: "kpi-eficiencia",       title: "Eficiência",         layout: { x: 6, y: 0, w: 3, h: 3 } },
  { id: "w4", kind: "kpi-tempo-medio",      title: "Tempo médio",        layout: { x: 9, y: 0, w: 3, h: 3 } },
  { id: "w5", kind: "chart-line-tempo",     title: "Produção ao longo do tempo", layout: { x: 0, y: 3, w: 8, h: 6 } },
  { id: "w6", kind: "chart-status",         title: "Status das ordens",  layout: { x: 8, y: 3, w: 4, h: 6 } },
  { id: "w7", kind: "chart-bar-equipamento", title: "Produção por equipamento", layout: { x: 0, y: 9, w: 6, h: 6 } },
  { id: "w8", kind: "table-top-ops",        title: "Top ordens",         layout: { x: 6, y: 9, w: 6, h: 6 } },
];

const CHART_COLORS = ["hsl(var(--primary))", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

// ---------- Helpers ----------
function toISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function presetRange(preset: Filters["preset"]): { de: string; ate: string } {
  const today = new Date();
  const ate = toISODate(today);
  if (preset === "hoje") return { de: ate, ate };
  if (preset === "7d") { const d = new Date(); d.setDate(d.getDate() - 6); return { de: toISODate(d), ate }; }
  if (preset === "30d") { const d = new Date(); d.setDate(d.getDate() - 29); return { de: toISODate(d), ate }; }
  if (preset === "mes") { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { de: toISODate(d), ate }; }
  return { de: ate, ate };
}
function inTurno(iso: string, turno: Turno) {
  if (turno === "todos") return true;
  const h = new Date(iso).getHours();
  const [a, b] = TURNO_WINDOWS[turno];
  return h >= a && h < b;
}
function uid() { return Math.random().toString(36).slice(2, 10); }

// ---------- Page ----------
function ProducaoDashboardPage() {
  // current user for per-user persistence
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? "anon"));
  }, []);

  // Filters
  const initial = presetRange("7d");
  const [filters, setFilters] = useState<Filters>({
    preset: "7d", de: initial.de, ate: initial.ate,
    equipIds: [], produtoId: "", ordemId: "", turno: "todos",
  });
  function patchFilters(p: Partial<Filters>) { setFilters((f) => ({ ...f, ...p })); }
  function changePreset(preset: Filters["preset"]) {
    if (preset === "custom") { patchFilters({ preset }); return; }
    const r = presetRange(preset);
    patchFilters({ preset, de: r.de, ate: r.ate });
  }

  // Widgets state (persisted to localStorage per user)
  const [widgets, setWidgets] = useState<WidgetInstance[]>(DEFAULT_WIDGETS);
  const [editMode, setEditMode] = useState(false);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!userId || loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as WidgetInstance[];
        if (Array.isArray(parsed) && parsed.length > 0) setWidgets(parsed);
      }
    } catch {}
  }, [userId]);
  useEffect(() => {
    if (!userId || !loadedRef.current) return;
    try { localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(widgets)); } catch {}
  }, [widgets, userId]);

  // Data
  const equipamentosQ = useQuery({
    queryKey: ["dash-equipamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("id,codigo,nome").eq("ativo", true).order("codigo");
      if (error) throw error;
      return data ?? [];
    },
  });
  const produtosQ = useQuery({
    queryKey: ["dash-produtos"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id,codigo,nome,unidade").eq("ativo", true).order("codigo");
      return data ?? [];
    },
  });

  const ordensQ = useQuery({
    queryKey: ["dash-ordens", filters.de, filters.ate, filters.produtoId, filters.ordemId],
    queryFn: async () => {
      const start = new Date(filters.de + "T00:00:00").toISOString();
      const end = new Date(filters.ate + "T23:59:59.999").toISOString();
      let q = supabase.from("ordens_producao")
        .select("id,numero,produto_id,equipamento_id,qtd_planejada,qtd_produzida,inicio_em,fim_em,status,produto:produto_id(nome,codigo,unidade),equipamento:equipamento_id(nome,codigo)")
        .gte("inicio_em", start).lte("inicio_em", end).order("inicio_em", { ascending: false });
      if (filters.produtoId) q = q.eq("produto_id", filters.produtoId);
      if (filters.ordemId) q = q.eq("id", filters.ordemId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rowsFiltered = useMemo(() => {
    const rows = ordensQ.data ?? [];
    return rows.filter((r) => {
      if (filters.equipIds.length > 0 && !filters.equipIds.includes(r.equipamento_id)) return false;
      if (filters.turno !== "todos" && !inTurno(r.inicio_em as string, filters.turno)) return false;
      return true;
    });
  }, [ordensQ.data, filters.equipIds, filters.turno]);

  // KPIs
  const kpis = useMemo(() => {
    let planejado = 0, produzido = 0, tempoMs = 0, tempoCount = 0;
    for (const r of rowsFiltered) {
      planejado += Number(r.qtd_planejada) || 0;
      produzido += Number(r.qtd_produzida) || 0;
      if (r.fim_em) { tempoMs += new Date(r.fim_em).getTime() - new Date(r.inicio_em).getTime(); tempoCount++; }
    }
    return {
      total: rowsFiltered.length,
      finalizadas: rowsFiltered.filter((r) => r.status === "finalizada").length,
      emAndamento: rowsFiltered.filter((r) => r.status === "em_andamento").length,
      planejado, produzido,
      eficiencia: planejado > 0 ? (produzido / planejado) * 100 : 0,
      tempoMedio: tempoCount ? tempoMs / tempoCount : null,
    };
  }, [rowsFiltered]);

  // Series per day per equipamento
  const seriesTempo = useMemo(() => {
    const equipMap = new Map((equipamentosQ.data ?? []).map((e) => [e.id, e.codigo]));
    const days = new Map<string, Record<string, number>>();
    for (const r of rowsFiltered) {
      const day = (r.inicio_em as string).slice(0, 10);
      if (!days.has(day)) days.set(day, {});
      const bucket = days.get(day)!;
      const key = equipMap.get(r.equipamento_id) ?? "—";
      bucket[key] = (bucket[key] ?? 0) + (Number(r.qtd_produzida) || 0);
    }
    const sortedDays = Array.from(days.keys()).sort();
    const equipKeys = Array.from(new Set(sortedDays.flatMap((d) => Object.keys(days.get(d)!))));
    const data = sortedDays.map((d) => ({ dia: d.slice(5), ...days.get(d)! }));
    return { data, keys: equipKeys };
  }, [rowsFiltered, equipamentosQ.data]);

  // Bar per equipamento
  const barEquip = useMemo(() => {
    const map = new Map<string, { equipamento: string; produzido: number; planejado: number; ops: number }>();
    for (const r of rowsFiltered) {
      const k = (r.equipamento as any)?.codigo ?? r.equipamento_id;
      const cur = map.get(k) ?? { equipamento: k, produzido: 0, planejado: 0, ops: 0 };
      cur.produzido += Number(r.qtd_produzida) || 0;
      cur.planejado += Number(r.qtd_planejada) || 0;
      cur.ops += 1;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.produzido - a.produzido);
  }, [rowsFiltered]);

  // Status distribution
  const statusDist = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rowsFiltered) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return Array.from(map.entries()).map(([k, v]) => ({ name: k, value: v }));
  }, [rowsFiltered]);

  // Per-equipamento for compare widget
  const perEquip = useMemo(() => {
    const map = new Map<string, { id: string; codigo: string; nome: string; ops: number; produzido: number; planejado: number; tempoMs: number; tempoCount: number; finalizadas: number }>();
    for (const r of rowsFiltered) {
      const e = (r.equipamento as any) ?? { codigo: "—", nome: "—" };
      const id = r.equipamento_id;
      const cur = map.get(id) ?? { id, codigo: e.codigo, nome: e.nome, ops: 0, produzido: 0, planejado: 0, tempoMs: 0, tempoCount: 0, finalizadas: 0 };
      cur.ops += 1;
      cur.produzido += Number(r.qtd_produzida) || 0;
      cur.planejado += Number(r.qtd_planejada) || 0;
      if (r.fim_em) { cur.tempoMs += new Date(r.fim_em).getTime() - new Date(r.inicio_em).getTime(); cur.tempoCount++; }
      if (r.status === "finalizada") cur.finalizadas++;
      map.set(id, cur);
    }
    let arr = Array.from(map.values());
    if (filters.equipIds.length > 0) arr = arr.filter((x) => filters.equipIds.includes(x.id));
    return arr.sort((a, b) => b.produzido - a.produzido);
  }, [rowsFiltered, filters.equipIds]);

  // Widget CRUD
  function addWidget(kind: WidgetKind) {
    const cat = WIDGET_CATALOG.find((c) => c.kind === kind)!;
    const maxY = widgets.reduce((m, w) => Math.max(m, w.layout.y + w.layout.h), 0);
    setWidgets((ws) => [...ws, {
      id: uid(), kind, title: cat.title.replace(/^[^·]+·\s*/, ""),
      layout: { x: 0, y: maxY, w: cat.defaultSize.w, h: cat.defaultSize.h },
    }]);
    setEditMode(true);
    toast.success("Widget adicionado");
  }
  function removeWidget(id: string) { setWidgets((ws) => ws.filter((w) => w.id !== id)); }
  function renameWidget(id: string, title: string) { setWidgets((ws) => ws.map((w) => w.id === id ? { ...w, title } : w)); }
  function resetDashboard() {
    setWidgets(DEFAULT_WIDGETS);
    toast.success("Dashboard restaurado");
  }
  function onLayoutChange(layout: readonly LayoutItem[]) {
    setWidgets((ws) => ws.map((w) => {
      const li = layout.find((l) => l.i === w.id);
      return li ? { ...w, layout: { x: li.x, y: li.y, w: li.w, h: li.h } } : w;
    }));
  }

  // Grid width tracking
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const layoutItems: LayoutItem[] = widgets.map((w) => ({
    i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, minW: 2, minH: 2,
  }));

  const ctx: WidgetCtx = {
    kpis, seriesTempo, barEquip, statusDist, perEquip,
    rowsFiltered, produtos: produtosQ.data ?? [],
    loading: ordensQ.isLoading,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard de Produção"
        description="Painel customizável com indicadores, gráficos e comparações de produção."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/producao"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link>
            </Button>
            <Button variant={editMode ? "default" : "outline"} size="sm" onClick={() => setEditMode((v) => !v)}>
              <Pencil className="mr-2 h-4 w-4" />{editMode ? "Concluir edição" : "Editar painel"}
            </Button>
            {editMode && (
              <>
                <AddWidgetDialog onAdd={addWidget} />
                <Button variant="ghost" size="sm" onClick={resetDashboard}>
                  <RotateCcw className="mr-2 h-4 w-4" />Restaurar padrão
                </Button>
              </>
            )}
          </div>
        }
      />

      <FilterBar
        filters={filters}
        onChange={patchFilters}
        onPreset={changePreset}
        equipamentos={equipamentosQ.data ?? []}
        produtos={produtosQ.data ?? []}
        ordens={ordensQ.data ?? []}
      />

      <div ref={containerRef} className="w-full">
        {widgets.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            Painel vazio. Clique em <strong>Editar painel</strong> e depois em <strong>Adicionar widget</strong>.
          </CardContent></Card>
        ) : (
          <GridLayout
            className="layout"
            layout={layoutItems as unknown as Layout}
            width={width}
            gridConfig={{ cols: COLS, rowHeight: ROW_H, margin: [12, 12] }}
            dragConfig={{ handle: ".widget-drag" }}
            onLayoutChange={onLayoutChange as (l: Layout) => void}
            isDraggable={editMode}
            isResizable={editMode}
          >
            {widgets.map((w) => (
              <div key={w.id}>
                <WidgetShell
                  widget={w}
                  editMode={editMode}
                  onRemove={() => removeWidget(w.id)}
                  onRename={(t) => renameWidget(w.id, t)}
                >
                  <WidgetBody widget={w} ctx={ctx} />
                </WidgetShell>
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}

// ---------- FilterBar ----------
function FilterBar({
  filters, onChange, onPreset, equipamentos, produtos, ordens,
}: {
  filters: Filters;
  onChange: (p: Partial<Filters>) => void;
  onPreset: (p: Filters["preset"]) => void;
  equipamentos: { id: string; codigo: string; nome: string }[];
  produtos: { id: string; codigo: string; nome: string }[];
  ordens: { id: string; numero: string }[];
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <div className="flex flex-wrap gap-1">
              {(["hoje", "7d", "30d", "mes", "custom"] as const).map((p) => (
                <Button key={p} size="sm" variant={filters.preset === p ? "default" : "outline"} onClick={() => onPreset(p)} className="h-8">
                  {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : p === "mes" ? "Mês" : "Custom"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={filters.de} onChange={(e) => onChange({ de: e.target.value, preset: "custom" })} className="h-8 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={filters.ate} onChange={(e) => onChange({ ate: e.target.value, preset: "custom" })} className="h-8 w-[150px]" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Equipamentos</Label>
            <EquipMultiSelect equipamentos={equipamentos} value={filters.equipIds} onChange={(v) => onChange({ equipIds: v })} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Produto</Label>
            <Select value={filters.produtoId || "_all"} onValueChange={(v) => onChange({ produtoId: v === "_all" ? "" : v })}>
              <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos os produtos</SelectItem>
                {produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} · {p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Ordem</Label>
            <Select value={filters.ordemId || "_all"} onValueChange={(v) => onChange({ ordemId: v === "_all" ? "" : v })}>
              <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todas as ordens</SelectItem>
                {ordens.map((o) => <SelectItem key={o.id} value={o.id}>OP {o.numero}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Turno</Label>
            <Select value={filters.turno} onValueChange={(v) => onChange({ turno: v as Turno })}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="A">A · 00h–06h</SelectItem>
                <SelectItem value="B">B · 06h–12h</SelectItem>
                <SelectItem value="C">C · 12h–18h</SelectItem>
                <SelectItem value="D">D · 18h–24h</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {filters.equipIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Equipamentos selecionados:</span>
            {filters.equipIds.map((id) => {
              const e = equipamentos.find((x) => x.id === id);
              return (
                <Badge key={id} variant="secondary" className="gap-1">
                  {e ? `${e.codigo} · ${e.nome}` : id}
                  <button onClick={() => onChange({ equipIds: filters.equipIds.filter((x) => x !== id) })}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EquipMultiSelect({ equipamentos, value, onChange }: {
  equipamentos: { id: string; codigo: string; nome: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-[220px] justify-between">
          <span className="truncate">{value.length === 0 ? "Todos os equipamentos" : `${value.length} selecionado(s)`}</span>
          <LayoutGrid className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-2" align="start">
        <div className="max-h-[280px] space-y-1 overflow-auto">
          {equipamentos.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Nenhum equipamento</div>}
          {equipamentos.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <Checkbox checked={value.includes(e.id)} onCheckedChange={() => toggle(e.id)} />
              <span className="text-sm">{e.codigo} · {e.nome}</span>
            </label>
          ))}
        </div>
        {value.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => onChange([])}>Limpar</Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------- AddWidgetDialog ----------
function AddWidgetDialog({ onAdd }: { onAdd: (k: WidgetKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" />Adicionar widget</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar widget</DialogTitle>
          <DialogDescription>Escolha o tipo de widget para adicionar ao seu painel.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {WIDGET_CATALOG.map((c) => (
            <button key={c.kind}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition hover:border-primary hover:bg-muted/40"
              onClick={() => { onAdd(c.kind); setOpen(false); }}>
              <div className="rounded-md bg-primary/10 p-2 text-primary"><c.icon className="h-4 w-4" /></div>
              <div className="flex-1">
                <div className="text-sm font-medium">{c.title}</div>
                <div className="text-xs text-muted-foreground">{c.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- WidgetShell ----------
function WidgetShell({ widget, editMode, onRemove, onRename, children }: {
  widget: WidgetInstance;
  editMode: boolean;
  onRemove: () => void;
  onRename: (t: string) => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(widget.title);
  useEffect(() => setVal(widget.title), [widget.title]);
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className={`${editMode ? "widget-drag cursor-move" : ""} flex-row items-center justify-between space-y-0 border-b px-3 py-2`}>
        {editing ? (
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => { onRename(val.trim() || widget.title); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onRename(val.trim() || widget.title); setEditing(false); } }}
            className="h-7 text-sm"
            autoFocus
          />
        ) : (
          <CardTitle className="truncate text-sm font-semibold">{widget.title}</CardTitle>
        )}
        {editMode && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onRemove}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="h-[calc(100%-2.5rem)] overflow-auto p-3">
        {children}
      </CardContent>
    </Card>
  );
}

// ---------- Widget Body ----------
type WidgetCtx = {
  kpis: { total: number; finalizadas: number; emAndamento: number; planejado: number; produzido: number; eficiencia: number; tempoMedio: number | null };
  seriesTempo: { data: any[]; keys: string[] };
  barEquip: { equipamento: string; produzido: number; planejado: number; ops: number }[];
  statusDist: { name: string; value: number }[];
  perEquip: { id: string; codigo: string; nome: string; ops: number; produzido: number; planejado: number; tempoMs: number; tempoCount: number; finalizadas: number }[];
  rowsFiltered: any[];
  produtos: { id: string; codigo: string; nome: string; unidade?: string }[];
  loading: boolean;
};

function WidgetBody({ widget, ctx }: { widget: WidgetInstance; ctx: WidgetCtx }) {
  if (ctx.loading) return <div className="grid h-full place-items-center text-xs text-muted-foreground">Carregando…</div>;
  switch (widget.kind) {
    case "kpi-total-ops":
      return <KpiBlock value={formatInt(ctx.kpis.total)} hint={`${ctx.kpis.finalizadas} finalizadas · ${ctx.kpis.emAndamento} em andamento`} />;
    case "kpi-produzido":
      return <KpiBlock value={formatNumber(ctx.kpis.produzido)} hint={`Planejado: ${formatNumber(ctx.kpis.planejado)}`} />;
    case "kpi-eficiencia":
      return <KpiBlock value={`${ctx.kpis.eficiencia.toFixed(1)}%`} hint="Produzido / Planejado" />;
    case "kpi-tempo-medio":
      return <KpiBlock value={ctx.kpis.tempoMedio != null ? formatDuration(ctx.kpis.tempoMedio) : "—"} hint="Média das OPs finalizadas" />;
    case "chart-line-tempo":
      if (ctx.seriesTempo.data.length === 0) return <EmptyChart />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={ctx.seriesTempo.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {ctx.seriesTempo.keys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    case "chart-bar-equipamento":
      if (ctx.barEquip.length === 0) return <EmptyChart />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ctx.barEquip}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="equipamento" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="planejado" fill="#94a3b8" name="Planejado" />
            <Bar dataKey="produzido" fill="hsl(var(--primary))" name="Produzido" />
          </BarChart>
        </ResponsiveContainer>
      );
    case "chart-status":
      if (ctx.statusDist.length === 0) return <EmptyChart />;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={ctx.statusDist} dataKey="value" nameKey="name" outerRadius="70%" label={{ fontSize: 11 }}>
              {ctx.statusDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      );
    case "table-top-ops":
      if (ctx.rowsFiltered.length === 0) return <EmptyChart />;
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OP</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Equipamento</TableHead>
              <TableHead className="text-right">Plan.</TableHead>
              <TableHead className="text-right">Prod.</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ctx.rowsFiltered.slice(0, 50).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                <TableCell className="text-xs">{(r.produto as any)?.nome ?? "—"}</TableCell>
                <TableCell className="text-xs">{(r.equipamento as any)?.codigo ?? "—"}</TableCell>
                <TableCell className="text-right text-xs">{formatNumber(Number(r.qtd_planejada) || 0)}</TableCell>
                <TableCell className="text-right text-xs">{formatNumber(Number(r.qtd_produzida) || 0)}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    case "compare-equip":
      if (ctx.perEquip.length === 0) return <div className="grid h-full place-items-center text-xs text-muted-foreground">Selecione 2+ equipamentos no filtro para comparar.</div>;
      return (
        <div className="grid h-full gap-3 overflow-auto" style={{ gridTemplateColumns: `repeat(${Math.min(ctx.perEquip.length, 4)}, minmax(180px, 1fr))` }}>
          {ctx.perEquip.map((e) => {
            const ef = e.planejado > 0 ? (e.produzido / e.planejado) * 100 : 0;
            const tm = e.tempoCount ? e.tempoMs / e.tempoCount : null;
            return (
              <div key={e.id} className="rounded-lg border p-3">
                <div className="font-mono text-xs text-muted-foreground">{e.codigo}</div>
                <div className="truncate text-sm font-semibold">{e.nome}</div>
                <div className="mt-2 space-y-1.5 text-xs">
                  <Stat label="Ordens" value={formatInt(e.ops)} />
                  <Stat label="Finalizadas" value={formatInt(e.finalizadas)} />
                  <Stat label="Planejado" value={formatNumber(e.planejado)} />
                  <Stat label="Produzido" value={formatNumber(e.produzido)} />
                  <Stat label="Eficiência" value={`${ef.toFixed(1)}%`} highlight={ef >= 95} />
                  <Stat label="Tempo médio" value={tm != null ? formatDuration(tm) : "—"} />
                </div>
              </div>
            );
          })}
        </div>
      );
    default:
      return <div className="text-xs text-muted-foreground">Widget desconhecido</div>;
  }
}

function KpiBlock({ value, hint }: { value: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${highlight ? "text-emerald-600" : ""}`}>{value}</span>
    </div>
  );
}
function EmptyChart() {
  return <div className="grid h-full place-items-center text-xs text-muted-foreground">Sem dados no período selecionado.</div>;
}
