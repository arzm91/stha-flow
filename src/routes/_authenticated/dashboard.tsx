import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import GridLayout, { type Layout, type LayoutItem } from "react-grid-layout";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, X, LayoutGrid, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { WIDGET_SOURCES, getSource, type WidgetSource } from "@/lib/dashboard/widget-catalog";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";

export const Route = createFileRoute("/_authenticated/dashboard")({
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

const COLS = 12;
const ROW_H = 60;

function DashboardPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Widget | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [locked, setLocked] = useState(true);

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

  const tags = useQuery({
    queryKey: ["tags-live-names"],
    queryFn: async () => {
      const { data } = await supabase.from("tags_live").select("nome,unidade").order("nome");
      return (data ?? []) as TagRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (w: Partial<Widget> & { id?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      if (w.id) {
        const { error } = await supabase.from("dashboard_widgets").update({
          titulo: w.titulo, tipo: w.tipo, fonte: w.fonte, config: w.config, layout: w.layout,
        }).eq("id", w.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dashboard_widgets").insert({
          user_id: u.user.id,
          titulo: w.titulo!, tipo: w.tipo!, fonte: w.fonte!, config: w.config ?? {}, layout: w.layout ?? { x: 0, y: 999, w: 3, h: 2 },
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

  const updateLayouts = useMutation({
    mutationFn: async (items: { id: string; layout: Widget["layout"] }[]) => {
      await Promise.all(items.map((it) =>
        supabase.from("dashboard_widgets").update({ layout: it.layout }).eq("id", it.id),
      ));
    },
  });

  const handleLayoutChange = (next: readonly LayoutItem[]) => {
    if (!widgets.data || locked) return;
    const changed: { id: string; layout: Widget["layout"] }[] = [];
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Sua central de controle — adicione, mova e redimensione widgets de todo o sistema."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ao vivo
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setLocked((v) => !v)}>
              {locked ? <><Lock className="mr-2 h-4 w-4" />Layout travado</> : <><Unlock className="mr-2 h-4 w-4" />Layout editável</>}
            </Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-2 h-4 w-4" />Novo widget</Button>
              </DialogTrigger>
              <WidgetDialog
                key={newOpen ? "new" : "closed"}
                tags={tags.data ?? []}
                onSave={(p) => save.mutate(p)}
                loading={save.isPending}
              />
            </Dialog>
          </div>
        }
      />

      {widgets.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando widgets...</div>
      ) : !widgets.data || widgets.data.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-6 w-6" />}
          title="Seu dashboard está vazio"
          description="Adicione widgets para acompanhar produção, estoque, alertas, manutenção e mais."
          action={<Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" />Adicionar primeiro widget</Button>}
        />
      ) : (
        <DashboardGrid
          widgets={widgets.data}
          locked={locked}
          onEdit={setEditing}
          onDelete={(id) => remove.mutate(id)}
          onLayoutChange={handleLayoutChange}
        />
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <WidgetDialog
            key={editing.id}
            initial={editing}
            tags={tags.data ?? []}
            onSave={(p) => save.mutate({ ...p, id: editing.id, layout: editing.layout })}
            loading={save.isPending}
          />
        </Dialog>
      )}
    </div>
  );
}

function DashboardGrid({
  widgets, locked, onEdit, onDelete, onLayoutChange,
}: {
  widgets: Widget[];
  locked: boolean;
  onEdit: (w: Widget) => void;
  onDelete: (id: string) => void;
  onLayoutChange: (l: readonly LayoutItem[]) => void;
}) {
  const [width, setWidth] = useState(1200);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const layout: LayoutItem[] = widgets.map((w) => ({
    i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, minW: 2, minH: 2,
  }));

  return (
    <div ref={ref} className={`w-full ${locked ? "pd-no-resize" : ""}`}>
      <GridLayout
        className="layout"
        layout={layout as unknown as Layout}
        width={width}
        gridConfig={{ cols: COLS, rowHeight: ROW_H, margin: [12, 12] }}
        dragConfig={{ handle: ".widget-drag", disabled: locked }}
        onLayoutChange={onLayoutChange as (l: Layout) => void}
      >
        {widgets.map((w) => (
          <div key={w.id}>
            <Card className="h-full overflow-hidden flex flex-col">
              <CardHeader className={`flex-row items-center justify-between space-y-0 py-2 px-3 border-b ${locked ? "" : "widget-drag cursor-move"}`}>
                <CardTitle className="text-sm font-semibold truncate">{w.titulo}</CardTitle>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(w)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(w.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 p-3">
                <DashboardWidget widget={w} />
              </CardContent>
            </Card>
          </div>
        ))}
      </GridLayout>
    </div>
  );
}

// ---------- Widget Dialog ----------
function WidgetDialog({
  initial, tags, onSave, loading,
}: {
  initial?: Widget;
  tags: TagRow[];
  onSave: (w: Partial<Widget>) => void;
  loading: boolean;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [fonte, setFonte] = useState(initial?.fonte ?? "");
  const [tagNome, setTagNome] = useState<string>(String(initial?.config?.tag_nome ?? ""));
  const [min, setMin] = useState<string>(String(initial?.config?.min ?? "0"));
  const [max, setMax] = useState<string>(String(initial?.config?.max ?? "100"));

  const src = getSource(fonte);

  // auto-fill title when picking source
  useEffect(() => {
    if (!initial && src && !titulo) setTitulo(src.label);
  }, [fonte]); // eslint-disable-line

  const grouped = useMemo(() => {
    const g: Record<string, WidgetSource[]> = {};
    for (const s of WIDGET_SOURCES) {
      (g[s.grupo] ??= []).push(s);
    }
    return g;
  }, []);

  const submit = () => {
    if (!fonte || !src) { toast.error("Escolha uma fonte de dados"); return; }
    if (src.needsTag && !tagNome) { toast.error("Escolha uma tag"); return; }
    const config: Record<string, unknown> = {};
    if (src.needsTag) config.tag_nome = tagNome;
    if (fonte === "tag.gauge") {
      config.min = Number(min) || 0;
      config.max = Number(max) || 100;
    }
    const layout = initial?.layout ?? {
      x: 0, y: 999,
      w: src.defaultSize?.w ?? 3,
      h: src.defaultSize?.h ?? 2,
    };
    onSave({ titulo: titulo || src.label, tipo: src.tipo, fonte, config, layout });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? "Editar widget" : "Novo widget"}</DialogTitle>
        <DialogDescription>Escolha a fonte de dados e personalize o título.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
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
                {tags.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma tag recebida</div>
                ) : tags.map((t) => (
                  <SelectItem key={t.nome} value={t.nome}>
                    {t.nome}{t.unidade ? ` (${t.unidade})` : ""}
                  </SelectItem>
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
