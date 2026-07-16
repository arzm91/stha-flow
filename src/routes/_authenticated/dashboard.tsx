import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, Pencil, Trash2, LayoutGrid, MoreHorizontal, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { WIDGET_SOURCES, getSource, type WidgetSource } from "@/lib/dashboard/widget-catalog";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import RGL from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

type LayoutItem = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };
// @ts-expect-error runtime exports
const ResponsiveGrid = RGL.WidthProvider(RGL.Responsive);


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: pageHead({ title: "Dashboard — STHApc", description: "Acesse e gerencie Dashboard no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: "/dashboard" }),
  component: DashboardPage,
});

type Widget = {
  id: string;
  titulo: string;
  tipo: string;
  fonte: string;
  config: Record<string, unknown>;
  layout: { x: number; y: number; w: number; h: number };
};

type TagRow = { nome: string; unidade: string | null };
type TankRow = { id: string; codigo: string; nome: string };
type EquipRow = { id: string; codigo: string; nome: string };
type SheetRow = { id: string; nome: string };

function DashboardPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Widget | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const widgets = useQuery({
    queryKey: ["dashboard_widgets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_widgets")
        .select("id,titulo,tipo,fonte,config,layout")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Widget[];
    },
  });

  const lookups = useQuery({
    queryKey: ["dashboard-lookups"],
    queryFn: async () => {
      const [tags, tanks, equips, sheets] = await Promise.all([
        supabase.from("tags_live").select("nome,unidade").order("nome"),
        supabase.from("tanques").select("id,codigo,nome").order("nome"),
        supabase.from("equipamentos").select("id,codigo,nome").order("nome"),
        supabase.from("custom_sheets").select("id,nome").order("nome"),
      ]);
      return {
        tags: (tags.data ?? []) as TagRow[],
        tanks: (tanks.data ?? []) as TankRow[],
        equipamentos: (equips.data ?? []) as EquipRow[],
        sheets: (sheets.data ?? []) as SheetRow[],
      };
    },
  });

  const save = useMutation({
    mutationFn: async (w: Partial<Widget> & { id?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      if (w.id) {
        const { error } = await supabase.from("dashboard_widgets").update({
          titulo: w.titulo, tipo: w.tipo, fonte: w.fonte,
          config: w.config as never, layout: w.layout as never,
        }).eq("id", w.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dashboard_widgets").insert({
          user_id: u.user.id,
          titulo: w.titulo!, tipo: w.tipo!, fonte: w.fonte!,
          config: (w.config ?? {}) as never,
          layout: (w.layout ?? { x: 0, y: 0, w: 3, h: 2 }) as never,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard_widgets"] });
      setEditing(null);
      setNewOpen(false);
      toast.success("Widget salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dashboard_widgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard_widgets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Central de controle — arraste e redimensione os cards. Suas preferências ficam salvas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ao vivo
            </Badge>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-2 h-4 w-4" />Adicionar widget</Button>
              </DialogTrigger>
              <WidgetDialog
                key={newOpen ? "new" : "closed"}
                lookups={lookups.data}
                onSave={(p) => save.mutate(p)}
                loading={save.isPending}
              />
            </Dialog>
          </div>
        }
      />

      {widgets.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando widgets...</div>
      ) : (widgets.data ?? []).length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-6 w-6" />}
          title="Seu dashboard está vazio"
          description="Adicione widgets para acompanhar produção, estoque, alertas, manutenção, qualidade e mais. Você pode arrastar e redimensionar cada card."
          action={<Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" />Adicionar primeiro widget</Button>}
        />
      ) : (
        <DashboardGrid
          widgets={widgets.data!}
          onEdit={setEditing}
          onDelete={(id) => remove.mutate(id)}
        />
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <WidgetDialog
            key={editing.id}
            initial={editing}
            lookups={lookups.data}
            onSave={(p) => save.mutate({ ...p, id: editing.id, layout: editing.layout })}
            loading={save.isPending}
          />
        </Dialog>
      )}
    </div>
  );
}

function DashboardGrid({
  widgets, onEdit, onDelete,
}: {
  widgets: Widget[];
  onEdit: (w: Widget) => void;
  onDelete: (id: string) => void;
}) {
  const qc = useQueryClient();

  // Layout local (para arrastar/redimensionar sem esperar re-fetch)
  const [localLayout, setLocalLayout] = useState<LayoutItem[]>(() => buildLayout(widgets));
  const widgetIdsKey = widgets.map((w) => w.id).sort().join(",");
  useEffect(() => {
    setLocalLayout(buildLayout(widgets));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetIdsKey]);

  // Persistência (debounced)
  const pendingRef = useRef<LayoutItem[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(async (layouts: LayoutItem[]) => {
    // Só atualiza os que mudaram vs registro atual
    const byId = new Map(widgets.map((w) => [w.id, w.layout]));
    const changed = layouts.filter((l) => {
      const prev = byId.get(l.i);
      if (!prev) return false;
      return prev.x !== l.x || prev.y !== l.y || prev.w !== l.w || prev.h !== l.h;
    });
    if (changed.length === 0) return;
    await Promise.all(
      changed.map((l) =>
        supabase
          .from("dashboard_widgets")
          .update({ layout: { x: l.x, y: l.y, w: l.w, h: l.h } as never })
          .eq("id", l.i),
      ),
    );
    qc.invalidateQueries({ queryKey: ["dashboard_widgets"] });
  }, [widgets, qc]);

  const scheduleSave = useCallback((layouts: LayoutItem[]) => {
    pendingRef.current = layouts;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (pendingRef.current) void persist(pendingRef.current);
    }, 600);
  }, [persist]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <ResponsiveGrid
      className="dash-grid"
      layouts={{ lg: localLayout, md: localLayout, sm: localLayout, xs: localLayout }}
      breakpoints={{ lg: 1200, md: 900, sm: 600, xs: 0 }}
      cols={{ lg: 12, md: 12, sm: 6, xs: 2 }}
      rowHeight={90}
      margin={[16, 16]}
      containerPadding={[0, 0]}
      draggableHandle=".drag-handle"
      onLayoutChange={(current: LayoutItem[]) => {
        setLocalLayout(current);
        scheduleSave(current);
      }}

      compactType="vertical"
    >
      {widgets.map((w) => (
        <div key={w.id} className="group">
          <Card className="h-full overflow-hidden flex flex-col">
            <CardHeader className="drag-handle flex-row items-center justify-between space-y-0 py-2 px-3 border-b cursor-move select-none">
              <div className="flex items-center gap-1.5 min-w-0">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardTitle className="truncate text-sm font-semibold">{w.titulo}</CardTitle>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onPointerDown={(e) => e.stopPropagation()}>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label="Opções"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(w)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(w.id)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-3">
              <DashboardWidget widget={w} />
            </CardContent>
          </Card>
        </div>
      ))}
    </ResponsiveGrid>
  );
}

function buildLayout(widgets: Widget[]): LayoutItem[] {
  return widgets.map((w) => {
    const src = getSource(w.fonte);
    const defW = src?.colSpan ?? 3;
    const defH = src?.rowSpan ?? 2;
    const l = w.layout ?? { x: 0, y: 0, w: defW, h: defH };
    return {
      i: w.id,
      x: Math.max(0, Math.min(11, l.x ?? 0)),
      y: l.y ?? 0,
      w: Math.max(2, Math.min(12, l.w || defW)),
      h: Math.max(1, l.h || defH),
      minW: 2,
      minH: 1,
    };
  });
}

// ---------- Widget Dialog ----------
function WidgetDialog({
  initial, lookups, onSave, loading,
}: {
  initial?: Widget;
  lookups: { tags: TagRow[]; tanks: TankRow[]; equipamentos: EquipRow[]; sheets: SheetRow[] } | undefined;
  onSave: (w: Partial<Widget>) => void;
  loading: boolean;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [fonte, setFonte] = useState(initial?.fonte ?? "");
  const [tagNome, setTagNome] = useState<string>(String(initial?.config?.tag_nome ?? ""));
  const [tagNomes, setTagNomes] = useState<string[]>(
    Array.isArray(initial?.config?.tag_nomes) ? (initial!.config!.tag_nomes as string[]) : []
  );
  const [tagSearch, setTagSearch] = useState("");
  const [tankId, setTankId] = useState<string>(String(initial?.config?.tank_id ?? ""));
  const [equipId, setEquipId] = useState<string>(String(initial?.config?.equipamento_id ?? ""));
  const [sheetId, setSheetId] = useState<string>(String(initial?.config?.sheet_id ?? ""));
  const [min, setMin] = useState<string>(String(initial?.config?.min ?? "0"));
  const [max, setMax] = useState<string>(String(initial?.config?.max ?? "100"));

  const src = getSource(fonte);

  useEffect(() => {
    if (!initial && src && !titulo) setTitulo(src.label);
  }, [fonte]); // eslint-disable-line

  const grouped = useMemo(() => {
    const g: Record<string, WidgetSource[]> = {};
    for (const s of WIDGET_SOURCES) (g[s.grupo] ??= []).push(s);
    return g;
  }, []);

  const filteredTags = useMemo(() => {
    const list = lookups?.tags ?? [];
    if (!tagSearch.trim()) return list;
    const q = tagSearch.toLowerCase();
    return list.filter((t) => t.nome.toLowerCase().includes(q));
  }, [lookups?.tags, tagSearch]);

  const submit = () => {
    if (!fonte || !src) { toast.error("Escolha uma fonte de dados"); return; }
    if (src.needsTag && !tagNome) { toast.error("Escolha uma tag"); return; }
    if (src.needsMultiTag && tagNomes.length === 0) { toast.error("Escolha ao menos uma tag"); return; }
    if (src.needsTank && !tankId) { toast.error("Escolha um tanque"); return; }
    if (src.needsEquipamento && !equipId) { toast.error("Escolha um equipamento"); return; }
    if (src.needsSheet && !sheetId) { toast.error("Escolha uma tabela"); return; }
    const config: Record<string, unknown> = {};
    if (src.needsTag) config.tag_nome = tagNome;
    if (src.needsMultiTag) config.tag_nomes = tagNomes;
    if (src.needsTank) config.tank_id = tankId;
    if (src.needsEquipamento) config.equipamento_id = equipId;
    if (src.needsSheet) config.sheet_id = sheetId;
    if (fonte === "tag.gauge") {
      config.min = Number(min) || 0;
      config.max = Number(max) || 100;
    }
    const layout = initial?.layout ?? { x: 0, y: 0, w: src.colSpan ?? 3, h: src.rowSpan ?? 2 };
    onSave({ titulo: titulo || src.label, tipo: src.tipo, fonte, config, layout });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar widget" : "Novo widget"}</DialogTitle>
        <DialogDescription>Escolha a fonte de dados. Arraste e redimensione depois no dashboard.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div>
          <Label>Fonte de dados</Label>
          <Select value={fonte} onValueChange={setFonte}>
            <SelectTrigger><SelectValue placeholder="Escolha uma fonte..." /></SelectTrigger>
            <SelectContent className="max-h-[400px]">
              {Object.entries(grouped).map(([grupo, items]) => (
                <div key={grupo}>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{grupo}</div>
                  {items.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="mr-2 text-[10px] uppercase text-muted-foreground">[{s.tipo}]</span>
                      {s.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Título</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Produção do dia" />
        </div>
        {src?.needsTag && (
          <div>
            <Label>Tag</Label>
            <Select value={tagNome} onValueChange={setTagNome}>
              <SelectTrigger><SelectValue placeholder="Escolha uma tag..." /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {(lookups?.tags ?? []).length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma tag recebida</div>
                ) : (lookups?.tags ?? []).map((t) => (
                  <SelectItem key={t.nome} value={t.nome}>
                    {t.nome}{t.unidade ? ` (${t.unidade})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {src?.needsMultiTag && (
          <div>
            <div className="flex items-center justify-between">
              <Label>Tags ({tagNomes.length} selecionadas)</Label>
              {tagNomes.length > 0 ? (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTagNomes([])}>Limpar</Button>
              ) : null}
            </div>
            <Input
              placeholder="Filtrar tags..."
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              className="mt-1"
            />
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border p-2 space-y-1">
              {filteredTags.length === 0 ? (
                <div className="px-2 py-1 text-xs text-muted-foreground">Nenhuma tag encontrada</div>
              ) : filteredTags.map((t) => {
                const checked = tagNomes.includes(t.nome);
                return (
                  <label key={t.nome} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setTagNomes((prev) =>
                          v ? Array.from(new Set([...prev, t.nome])) : prev.filter((n) => n !== t.nome),
                        );
                      }}
                    />
                    <span className="text-sm truncate">{t.nome}</span>
                    {t.unidade ? <span className="text-[10px] text-muted-foreground">({t.unidade})</span> : null}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {src?.needsTank && (
          <div>
            <Label>Tanque / Local</Label>
            <Select value={tankId} onValueChange={setTankId}>
              <SelectTrigger><SelectValue placeholder="Escolha um tanque..." /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {(lookups?.tanks ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.codigo} — {t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {src?.needsEquipamento && (
          <div>
            <Label>Equipamento</Label>
            <Select value={equipId} onValueChange={setEquipId}>
              <SelectTrigger><SelectValue placeholder="Escolha um equipamento..." /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {(lookups?.equipamentos ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.codigo} — {e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {src?.needsSheet && (
          <div>
            <Label>Tabela</Label>
            <Select value={sheetId} onValueChange={setSheetId}>
              <SelectTrigger><SelectValue placeholder="Escolha uma tabela..." /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {(lookups?.sheets ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {fonte === "tag.gauge" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mínimo</Label>
              <Input type="number" value={min} onChange={(e) => setMin(e.target.value)} />
            </div>
            <div>
              <Label>Máximo</Label>
              <Input type="number" value={max} onChange={(e) => setMax(e.target.value)} />
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
