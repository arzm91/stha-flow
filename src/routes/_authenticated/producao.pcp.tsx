import { pageHead } from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Play,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { guardAdmin, isAdminCancelled } from "@/lib/security/guard-admin";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/producao/pcp")({
  head: pageHead({ title: "Produção · PCP / Ordens — STHApc", description: "Acesse e gerencie Produção · PCP / Ordens no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: "/producao/pcp" }),
  component: PcpPage,
});

type Prioridade = "alta" | "media" | "baixa";
type Status = "programada" | "em_andamento" | "finalizada" | "cancelada";

type Ordem = {
  id: string;
  numero: string;
  produto_id: string;
  equipamento_id: string;
  qtd_planejada: number;
  qtd_produzida: number | null;
  status: Status;
  inicio_em: string | null;
  fim_em: string | null;
  inicio_previsto: string | null;
  duracao_estimada_min: number | null;
  prioridade: Prioridade;
  fila_posicao: number | null;
  auto_iniciar: boolean;
  produto: { nome: string; codigo: string } | null;
  equipamento: { nome: string; codigo: string; status: string } | null;
};

type Equip = { id: string; codigo: string; nome: string; status: string };
type Prod = { id: string; codigo: string; nome: string };

const PRIO_LABEL: Record<Prioridade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const PRIO_CLS: Record<Prioridade, string> = {
  alta: "bg-destructive/15 text-destructive border-destructive/30",
  media: "bg-warning/15 text-warning border-warning/30",
  baixa: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL: Record<Status, string> = {
  programada: "Programada",
  em_andamento: "Em andamento",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtDur(min: number | null | undefined) {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}
function toLocalDateTimeInput(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function colorForEquip(id: string) {
  // hash to HSL
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 45%)`;
}

function PcpPage() {
  const qc = useQueryClient();
  const [programarOpen, setProgramarOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<Ordem | null>(null);
  const [editingNumero, setEditingNumero] = useState<Ordem | null>(null);
  const [selected, setSelected] = useState<Ordem | null>(null);

  const equipamentos = useQuery({
    queryKey: ["pcp-equipamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("id,codigo,nome,status").eq("ativo", true).eq("categoria", "producao").order("codigo");
      if (error) throw error;
      return (data ?? []) as Equip[];
    },
  });

  const ordens = useQuery({
    queryKey: ["pcp-ordens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_producao")
        .select(
          "id,numero,produto_id,equipamento_id,qtd_planejada,qtd_produzida,status,inicio_em,fim_em,inicio_previsto,duracao_estimada_min,prioridade,fila_posicao,auto_iniciar,produto:produto_id(nome,codigo),equipamento:equipamento_id(nome,codigo,status)",
        )
        .in("status", ["programada", "em_andamento", "finalizada"])
        .order("status")
        .order("inicio_previsto", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Ordem[];
    },
    refetchInterval: 15_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pcp-ordens"] });
    qc.invalidateQueries({ queryKey: ["pcp-equipamentos"] });
    qc.invalidateQueries({ queryKey: ["equipamentos"] });
    qc.invalidateQueries({ queryKey: ["ops-ativas"] });
  };

  const programadas = useMemo(
    () =>
      (ordens.data ?? [])
        .filter((o) => o.status === "programada")
        .sort((a, b) => {
          const pa = a.fila_posicao ?? 9999;
          const pb = b.fila_posicao ?? 9999;
          if (pa !== pb) return pa - pb;
          const ta = a.inicio_previsto ? new Date(a.inicio_previsto).getTime() : Infinity;
          const tb = b.inicio_previsto ? new Date(b.inicio_previsto).getTime() : Infinity;
          return ta - tb;
        }),
    [ordens.data],
  );
  const emAndamento = useMemo(() => (ordens.data ?? []).filter((o) => o.status === "em_andamento"), [ordens.data]);
  const finalizadas = useMemo(
    () =>
      (ordens.data ?? [])
        .filter((o) => o.status === "finalizada")
        .sort((a, b) => new Date(b.fim_em ?? 0).getTime() - new Date(a.fim_em ?? 0).getTime())
        .slice(0, 50),
    [ordens.data],
  );

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/producao"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link>
      </Button>
      <PageHeader
        title="PCP / Ordens"
        description="Programe, acompanhe e priorize a produção por equipamento."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setManualOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Registrar produção manual
            </Button>
            <Button onClick={() => { setEditing(null); setProgramarOpen(true); }}>
              <CalendarPlus className="mr-2 h-4 w-4" />Programar ordem
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <KpiMini label="Programadas" value={programadas.length} />
        <KpiMini label="Em andamento" value={emAndamento.length} />
        <KpiMini label="Finalizadas (recentes)" value={finalizadas.length} />
        <KpiMini label="Equipamentos disponíveis" value={(equipamentos.data ?? []).filter((e) => e.status === "disponivel").length} />
      </div>

      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="fila">Fila por equipamento</TabsTrigger>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="gantt">Gantt</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <KanbanView
            programadas={programadas}
            emAndamento={emAndamento}
            finalizadas={finalizadas}
            onClick={setSelected}
          />
        </TabsContent>

        <TabsContent value="fila">
          <FilaView
            equipamentos={equipamentos.data ?? []}
            ordens={ordens.data ?? []}
            onClick={setSelected}
            onChanged={refresh}
          />
        </TabsContent>

        <TabsContent value="calendario">
          <CalendarioView ordens={programadas.concat(emAndamento)} onClick={setSelected} />
        </TabsContent>

        <TabsContent value="gantt">
          <GanttView equipamentos={equipamentos.data ?? []} ordens={programadas.concat(emAndamento)} onClick={setSelected} />
        </TabsContent>
      </Tabs>

      <ProgramarOrdemDialog
        open={programarOpen}
        onOpenChange={setProgramarOpen}
        editing={editing}
        equipamentos={equipamentos.data ?? []}
        onDone={() => { setEditing(null); refresh(); }}
      />

      <OrdemDetalheSheet
        ordem={selected}
        equipamentos={equipamentos.data ?? []}
        onClose={() => setSelected(null)}
        onEdit={(o) => { setSelected(null); setEditing(o); setProgramarOpen(true); }}
        onEditNumero={(o) => { setSelected(null); setEditingNumero(o); }}
        onChanged={refresh}
      />

      <EditNumeroDialog
        ordem={editingNumero}
        onClose={() => setEditingNumero(null)}
        onDone={() => { setEditingNumero(null); refresh(); }}
      />

      <RegistrarProducaoManualDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        equipamentos={equipamentos.data ?? []}
        onDone={refresh}
      />
    </div>
  );
}

function KpiMini({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

// ============= Kanban =============

function KanbanView({
  programadas,
  emAndamento,
  finalizadas,
  onClick,
}: {
  programadas: Ordem[];
  emAndamento: Ordem[];
  finalizadas: Ordem[];
  onClick: (o: Ordem) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Coluna titulo="Programadas" cor="border-warning/40" ordens={programadas} onClick={onClick} />
      <Coluna titulo="Em andamento" cor="border-primary/40" ordens={emAndamento} onClick={onClick} />
      <Coluna titulo="Finalizadas" cor="border-success/40" ordens={finalizadas} onClick={onClick} />
    </div>
  );
}

function Coluna({ titulo, cor, ordens, onClick }: { titulo: string; cor: string; ordens: Ordem[]; onClick: (o: Ordem) => void }) {
  return (
    <Card className={`${cor} border-t-4`}>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{titulo}</div>
          <Badge variant="outline">{ordens.length}</Badge>
        </div>
        {ordens.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Sem ordens</div>
        ) : (
          <div className="space-y-2">
            {ordens.map((o) => (
              <button
                key={o.id}
                onClick={() => onClick(o)}
                className="w-full rounded-md border bg-card p-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-mono text-xs text-muted-foreground">OP {o.numero}</div>
                  <Badge variant="outline" className={PRIO_CLS[o.prioridade]}>{PRIO_LABEL[o.prioridade]}</Badge>
                </div>
                <div className="mt-1 font-medium">{o.produto?.nome ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{o.equipamento?.codigo ?? "—"} · {o.qtd_planejada}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {o.status === "programada" && <>Previsto: {fmtDT(o.inicio_previsto)} · {fmtDur(o.duracao_estimada_min)}</>}
                  {o.status === "em_andamento" && <>Início: {fmtDT(o.inicio_em)}</>}
                  {o.status === "finalizada" && <>Fim: {fmtDT(o.fim_em)}</>}
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============= Fila por equipamento =============

function FilaView({
  equipamentos,
  ordens,
  onClick,
  onChanged,
}: {
  equipamentos: Equip[];
  ordens: Ordem[];
  onClick: (o: Ordem) => void;
  onChanged: () => void;
}) {
  const moverFila = useMutation({
    mutationFn: async ({ id, dir, equipId }: { id: string; dir: -1 | 1; equipId: string }) => {
      const fila = ordens
        .filter((o) => o.equipamento_id === equipId && o.status === "programada")
        .sort((a, b) => (a.fila_posicao ?? 9999) - (b.fila_posicao ?? 9999));
      const idx = fila.findIndex((o) => o.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= fila.length) return;
      const a = fila[idx], b = fila[swap];
      const pa = a.fila_posicao ?? idx;
      const pb = b.fila_posicao ?? swap;
      await supabase.from("ordens_producao").update({ fila_posicao: pb }).eq("id", a.id);
      await supabase.from("ordens_producao").update({ fila_posicao: pa }).eq("id", b.id);
    },
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {equipamentos.map((e) => {
        const ativa = ordens.find((o) => o.equipamento_id === e.id && o.status === "em_andamento");
        const fila = ordens
          .filter((o) => o.equipamento_id === e.id && o.status === "programada")
          .sort((a, b) => (a.fila_posicao ?? 9999) - (b.fila_posicao ?? 9999));
        return (
          <Card key={e.id}>
            <CardContent className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">{e.codigo}</div>
                  <div className="font-semibold">{e.nome}</div>
                </div>
                <Badge variant="outline" className={e.status === "disponivel" ? "border-success/40 bg-success/10 text-success" : "border-primary/40 bg-primary/10 text-primary"}>
                  {e.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {ativa && (
                  <button onClick={() => onClick(ativa)} className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-left text-sm">
                    <div className="font-mono text-[10px]">EM ANDAMENTO</div>
                    <div className="font-medium">OP {ativa.numero}</div>
                    <div className="text-xs text-muted-foreground">{ativa.produto?.nome ?? "—"}</div>
                  </button>
                )}
                {fila.length === 0 && !ativa && (
                  <div className="text-xs text-muted-foreground">Sem ordens programadas.</div>
                )}
                {fila.map((o, i) => (
                  <div key={o.id} className="flex items-center gap-1">
                    {i === 0 && ativa && <span className="text-muted-foreground">→</span>}
                    <button onClick={() => onClick(o)} className="rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent">
                      <div className="font-mono text-[10px] text-muted-foreground">#{i + 1} · OP {o.numero}</div>
                      <div className="font-medium">{o.produto?.nome ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{fmtDT(o.inicio_previsto)} · {fmtDur(o.duracao_estimada_min)}</div>
                    </button>
                    <div className="flex flex-col">
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moverFila.mutate({ id: o.id, dir: -1, equipId: e.id })} disabled={i === 0}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moverFila.mutate({ id: o.id, dir: 1, equipId: e.id })} disabled={i === fila.length - 1}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============= Calendário =============

function CalendarioView({ ordens, onClick }: { ordens: Ordem[]; onClick: (o: Ordem) => void }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const grid = useMemo(() => {
    const first = new Date(cursor);
    const startW = new Date(first);
    startW.setDate(first.getDate() - first.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startW);
      d.setDate(startW.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ordem[]>();
    for (const o of ordens) {
      const ts = o.inicio_previsto ?? o.inicio_em;
      if (!ts) continue;
      const key = new Date(ts).toISOString().slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(o);
    }
    return m;
  }, [ordens]);

  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-semibold capitalize">
            {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border">
          {grid.map((d, i) => {
            const key = d.toISOString().slice(0, 10);
            const inMonth = d.getMonth() === cursor.getMonth();
            const list = byDay.get(key) ?? [];
            const today = new Date().toDateString() === d.toDateString();
            return (
              <div key={i} className={`min-h-[90px] bg-card p-1 text-xs ${inMonth ? "" : "opacity-40"}`}>
                <div className={`mb-1 text-right ${today ? "rounded bg-primary px-1 text-primary-foreground" : "text-muted-foreground"}`}>{d.getDate()}</div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => onClick(o)}
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-white"
                      style={{ backgroundColor: colorForEquip(o.equipamento_id) }}
                      title={`OP ${o.numero} · ${o.produto?.nome ?? ""}`}
                    >
                      OP {o.numero} {o.produto?.nome ?? ""}
                    </button>
                  ))}
                  {list.length > 3 && <div className="text-[10px] text-muted-foreground">+{list.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============= Gantt =============

function GanttView({ equipamentos, ordens, onClick }: { equipamentos: Equip[]; ordens: Ordem[]; onClick: (o: Ordem) => void }) {
  const [pxPorMin, setPxPorMin] = useState(0.5); // 0.5px/min = 30px/h
  const [dias, setDias] = useState(7);

  const inicio = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const fim = useMemo(() => new Date(inicio.getTime() + dias * 86400000), [inicio, dias]);

  const totalMin = (fim.getTime() - inicio.getTime()) / 60000;
  const width = totalMin * pxPorMin;

  const visiveis = ordens.filter((o) => {
    const start = o.inicio_em ?? o.inicio_previsto;
    if (!start) return false;
    const s = new Date(start).getTime();
    return s >= inicio.getTime() && s < fim.getTime();
  });

  const hoursMark: Date[] = [];
  for (let i = 0; i <= dias; i++) hoursMark.push(new Date(inicio.getTime() + i * 86400000));

  return (
    <Card>
      <CardContent className="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="text-xs text-muted-foreground">Período:</div>
          <Button size="sm" variant={dias === 1 ? "default" : "outline"} onClick={() => setDias(1)}>1d</Button>
          <Button size="sm" variant={dias === 3 ? "default" : "outline"} onClick={() => setDias(3)}>3d</Button>
          <Button size="sm" variant={dias === 7 ? "default" : "outline"} onClick={() => setDias(7)}>7d</Button>
          <Button size="sm" variant={dias === 14 ? "default" : "outline"} onClick={() => setDias(14)}>14d</Button>
          <div className="ml-3 flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setPxPorMin((v) => Math.max(0.1, v / 1.5))}><ZoomOut className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => setPxPorMin((v) => Math.min(5, v * 1.5))}><ZoomIn className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex">
            <div className="w-32 shrink-0 border-r">
              <div className="h-8 border-b" />
              {equipamentos.map((e) => (
                <div key={e.id} className="flex h-14 items-center border-b px-2 text-xs">
                  <div>
                    <div className="font-mono text-[10px] text-muted-foreground">{e.codigo}</div>
                    <div className="truncate font-medium">{e.nome}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="relative" style={{ width }}>
              <div className="relative h-8 border-b">
                {hoursMark.map((d, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l text-[10px] text-muted-foreground"
                    style={{ left: ((d.getTime() - inicio.getTime()) / 60000) * pxPorMin }}
                  >
                    <div className="px-1">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
                  </div>
                ))}
              </div>
              {equipamentos.map((e) => {
                const rows = visiveis.filter((o) => o.equipamento_id === e.id);
                return (
                  <div key={e.id} className="relative h-14 border-b">
                    {rows.map((o) => {
                      const start = new Date(o.inicio_em ?? o.inicio_previsto!).getTime();
                      const dur = (o.duracao_estimada_min ?? 60);
                      const left = ((start - inicio.getTime()) / 60000) * pxPorMin;
                      const w = Math.max(20, dur * pxPorMin);
                      const cor = o.status === "em_andamento" ? "hsl(var(--primary))" : colorForEquip(o.equipamento_id);
                      return (
                        <button
                          key={o.id}
                          onClick={() => onClick(o)}
                          className="absolute top-2 h-10 overflow-hidden rounded px-1 text-left text-[11px] text-white shadow-sm"
                          style={{ left, width: w, backgroundColor: cor, opacity: o.status === "programada" ? 0.7 : 1, border: o.status === "em_andamento" ? "2px solid hsl(var(--primary-foreground))" : "none" }}
                          title={`OP ${o.numero} · ${o.produto?.nome ?? ""} · ${fmtDur(dur)}`}
                        >
                          <div className="truncate font-semibold">OP {o.numero}</div>
                          <div className="truncate">{o.produto?.nome ?? ""}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= Programar Ordem Dialog =============

function ProgramarOrdemDialog({
  open,
  onOpenChange,
  editing,
  equipamentos,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Ordem | null;
  equipamentos: Equip[];
  onDone: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [qtd, setQtd] = useState<number | "">("");
  const [inicioPrev, setInicioPrev] = useState("");
  const [duracao, setDuracao] = useState<number | "">("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [autoIniciar, setAutoIniciar] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setNumero(editing.numero);
      setProdutoId(editing.produto_id);
      setEquipamentoId(editing.equipamento_id);
      setQtd(editing.qtd_planejada);
      setInicioPrev(toLocalDateTimeInput(editing.inicio_previsto));
      setDuracao(editing.duracao_estimada_min ?? "");
      setPrioridade(editing.prioridade);
      setAutoIniciar(editing.auto_iniciar);
    } else {
      setNumero("");
      setProdutoId("");
      setEquipamentoId("");
      setQtd("");
      setInicioPrev(toLocalDateTimeInput(null));
      setDuracao("");
      setPrioridade("media");
      setAutoIniciar(true);
    }
  }, [open, editing]);

  const produtos = useQuery({
    queryKey: ["pcp-produtos"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id,codigo,nome").eq("ativo", true).order("nome");
      return (data ?? []) as Prod[];
    },
  });

  // Pré-preenche duração com soma das atividades cadastradas no equipamento
  useEffect(() => {
    if (!equipamentoId || editing) return;
    (async () => {
      const { data } = await supabase
        .from("equipamento_atividades")
        .select("tempo_estimado_min")
        .eq("equipamento_id", equipamentoId)
        .eq("ativo", true);
      const soma = (data ?? []).reduce(
        (a, p) => a + (Number((p as { tempo_estimado_min: number | null }).tempo_estimado_min) || 0),
        0,
      );
      if (soma > 0) setDuracao(soma);
    })();
  }, [equipamentoId, editing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!numero || !produtoId || !equipamentoId || qtd === "" || !inicioPrev || duracao === "") {
        throw new Error("Preencha todos os campos obrigatórios");
      }
      const inicioIso = new Date(inicioPrev).toISOString();
      if (editing) {
        const { error } = await supabase.from("ordens_producao").update({
          numero,
          produto_id: produtoId,
          equipamento_id: equipamentoId,
          qtd_planejada: Number(qtd),
          inicio_previsto: inicioIso,
          duracao_estimada_min: Number(duracao),
          prioridade,
          auto_iniciar: autoIniciar,
        }).eq("id", editing.id);
        if (error) throw error;
        return editing.id;
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error("Não autenticado");
        // próxima posição da fila para o equipamento
        const { data: maxRow } = await supabase
          .from("ordens_producao")
          .select("fila_posicao")
          .eq("equipamento_id", equipamentoId)
          .eq("status", "programada")
          .order("fila_posicao", { ascending: false, nullsFirst: false })
          .limit(1);
        const proxPos = ((maxRow?.[0]?.fila_posicao as number | null) ?? 0) + 1;
        const { data, error } = await supabase.from("ordens_producao").insert({
          owner_id: u.user.id,
          numero,
          produto_id: produtoId,
          equipamento_id: equipamentoId,
          qtd_planejada: Number(qtd),
          status: "programada",
          inicio_em: null,
          inicio_previsto: inicioIso,
          duracao_estimada_min: Number(duracao),
          prioridade,
          fila_posicao: proxPos,
          auto_iniciar: autoIniciar,
        }).select("id").single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Ordem atualizada" : "Ordem programada");
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar ordem programada" : "Programar nova ordem"}</DialogTitle>
          <DialogDescription>Adicione uma ordem à fila do equipamento.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Número da OP</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade planejada</Label>
              <Input type="number" step="any" value={qtd} onChange={(e) => setQtd(e.target.value === "" ? "" : Number(e.target.value))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Produto</Label>
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} required className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— selecione —</option>
                {(produtos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Equipamento</Label>
              <select value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)} required className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— selecione —</option>
                {equipamentos.map((eq) => <option key={eq.id} value={eq.id}>{eq.codigo} — {eq.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Início previsto</Label>
              <Input type="datetime-local" value={inicioPrev} onChange={(e) => setInicioPrev(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Duração estimada (min)</Label>
              <Input type="number" min={1} value={duracao} onChange={(e) => setDuracao(e.target.value === "" ? "" : Number(e.target.value))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <Label className="text-sm">Iniciar automaticamente</Label>
                <div className="text-[11px] text-muted-foreground">Ao liberar o equipamento</div>
              </div>
              <Switch checked={autoIniciar} onCheckedChange={setAutoIniciar} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : editing ? "Salvar" : "Programar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============= Detalhe / ações =============

function OrdemDetalheSheet({
  ordem,
  equipamentos,
  onClose,
  onEdit,
  onEditNumero,
  onChanged,
}: {
  ordem: Ordem | null;
  equipamentos: Equip[];
  onClose: () => void;
  onEdit: (o: Ordem) => void;
  onEditNumero: (o: Ordem) => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const open = !!ordem;
  const equip = equipamentos.find((e) => e.id === ordem?.equipamento_id);
  const equipOcupado = equip?.status === "ocupado";
  const equipManut = equip?.status === "manutencao";

  const iniciar = useMutation({
    mutationFn: async () => {
      if (!ordem) return;
      if (equipManut) throw new Error("Equipamento em manutenção.");
      if (equipOcupado) throw new Error("Equipamento ocupado — use 'Enfileirar' ou aguarde liberação.");
      const { data: nowData } = await supabase.rpc("server_now");
      const startIso = new Date(nowData as unknown as string).toISOString();
      const { error } = await supabase.from("ordens_producao").update({
        status: "em_andamento",
        inicio_em: startIso,
        fila_posicao: null,
      }).eq("id", ordem.id);
      if (error) throw error;
      const { error: e2 } = await supabase.from("equipamentos").update({ status: "ocupado" }).eq("id", ordem.equipamento_id);
      if (e2) throw e2;
      return ordem.id;
    },
    onSuccess: (id) => {
      toast.success("Produção iniciada");
      onClose();
      onChanged();
      if (id) navigate({ to: "/producao/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      if (!ordem) return;
      const { error } = await supabase.from("ordens_producao").update({ status: "cancelada", fila_posicao: null }).eq("id", ordem.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ordem cancelada"); onClose(); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAuto = useMutation({
    mutationFn: async (v: boolean) => {
      if (!ordem) return;
      const { error } = await supabase.from("ordens_producao").update({ auto_iniciar: v }).eq("id", ordem.id);
      if (error) throw error;
    },
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        {ordem && (
          <>
            <SheetHeader>
              <SheetTitle>OP {ordem.numero}</SheetTitle>
              <SheetDescription>
                {ordem.produto?.nome ?? "—"} · {ordem.equipamento?.codigo ?? "—"}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{STATUS_LABEL[ordem.status]}</Badge>
                <Badge variant="outline" className={PRIO_CLS[ordem.prioridade]}>{PRIO_LABEL[ordem.prioridade]}</Badge>
              </div>
              <Info label="Quantidade planejada" value={String(ordem.qtd_planejada)} />
              <Info label="Início previsto" value={fmtDT(ordem.inicio_previsto)} />
              <Info label="Início real" value={fmtDT(ordem.inicio_em)} />
              <Info label="Fim" value={fmtDT(ordem.fim_em)} />
              <Info label="Duração estimada" value={fmtDur(ordem.duracao_estimada_min)} />
              {ordem.status === "programada" && (
                <Info label="Posição na fila" value={ordem.fila_posicao != null ? `#${ordem.fila_posicao}` : "—"} />
              )}

              {ordem.status === "programada" && (
                <div className="rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Iniciar automaticamente</div>
                      <div className="text-[11px] text-muted-foreground">Quando o equipamento liberar</div>
                    </div>
                    <Switch checked={ordem.auto_iniciar} onCheckedChange={(v) => toggleAuto.mutate(v)} />
                  </div>
                </div>
              )}

              {ordem.status === "programada" && (
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                  {equipManut
                    ? <>Equipamento em manutenção — não é possível iniciar.</>
                    : equipOcupado
                      ? <>Equipamento ocupado. {ordem.auto_iniciar ? "Esta ordem iniciará automaticamente quando a atual for finalizada." : "Ative 'Iniciar automaticamente' para enfileirar, ou aguarde liberação."}</>
                      : <>Equipamento disponível — pronto para iniciar.</>}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {ordem.status === "programada" && (
                <>
                  <Button onClick={() => iniciar.mutate()} disabled={iniciar.isPending || equipManut || equipOcupado}>
                    <Play className="mr-2 h-4 w-4" />Iniciar produção
                  </Button>
                  <Button variant="outline" onClick={() => onEdit(ordem)}>Reprogramar</Button>
                  <Button variant="ghost" className="text-destructive" onClick={() => cancelar.mutate()} disabled={cancelar.isPending}>
                    <Trash2 className="mr-2 h-4 w-4" />Cancelar
                  </Button>
                </>
              )}
              {ordem.status === "em_andamento" && (
                <Button asChild>
                  <Link to="/producao/$id" params={{ id: ordem.id }} onClick={onClose}>
                    <Eye className="mr-2 h-4 w-4" />Abrir acompanhamento
                  </Link>
                </Button>
              )}
              {ordem.status === "finalizada" && (
                <>
                  <Button asChild>
                    <Link to="/producao/finalizada/$id" params={{ id: ordem.id }} onClick={onClose}>
                      <Eye className="mr-2 h-4 w-4" />Ver detalhes e eventos
                    </Link>
                  </Button>
                  <Button variant="outline" onClick={() => onEditNumero(ordem)}>
                    <Pencil className="mr-2 h-4 w-4" />Editar OP
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

// ============= Editar apenas o número da OP (para ordens finalizadas) =============

function EditNumeroDialog({
  ordem, onClose, onDone,
}: { ordem: Ordem | null; onClose: () => void; onDone: () => void }) {
  const [numero, setNumero] = useState("");
  useEffect(() => {
    if (ordem) setNumero(ordem.numero);
  }, [ordem]);

  const save = useMutation({
    mutationFn: async () => {
      if (!ordem) return;
      if (!numero.trim()) throw new Error("Informe o número da OP");
      const { error } = await supabase.from("ordens_producao").update({ numero: numero.trim() }).eq("id", ordem.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("OP atualizada"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!ordem} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar OP {ordem?.numero}</DialogTitle>
          <DialogDescription>
            Somente o número da OP pode ser alterado em ordens finalizadas. Demais dados são preservados como registro histórico.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-1.5">
            <Label>Número da OP</Label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============= Registrar produção manual (retroativa, já finalizada) =============

function RegistrarProducaoManualDialog({
  open, onOpenChange, equipamentos, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  equipamentos: Equip[];
  onDone: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [qtdPlanejada, setQtdPlanejada] = useState<number | "">("");
  const [qtdProduzida, setQtdProduzida] = useState<number | "">("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [tanqueId, setTanqueId] = useState("");
  const [obsIniciais, setObsIniciais] = useState("");
  const [obsFinais, setObsFinais] = useState("");
  const [lancarEstoque, setLancarEstoque] = useState(true);

  useEffect(() => {
    if (!open) return;
    setNumero(""); setProdutoId(""); setEquipamentoId("");
    setQtdPlanejada(""); setQtdProduzida("");
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    setInicio(toLocalDateTimeInput(oneHourAgo.toISOString()));
    setFim(toLocalDateTimeInput(now.toISOString()));
    setTanqueId(""); setObsIniciais(""); setObsFinais(""); setLancarEstoque(true);
  }, [open]);

  const produtos = useQuery({
    queryKey: ["pcp-produtos"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id,codigo,nome").eq("ativo", true).order("nome");
      return (data ?? []) as Prod[];
    },
  });

  const tanques = useQuery({
    queryKey: ["pcp-tanques", produtoId],
    enabled: !!produtoId,
    queryFn: async () => {
      const { data } = await supabase.from("tanques").select("id,codigo,nome,produto_id").order("codigo");
      return (data ?? []).filter((t: any) => !t.produto_id || t.produto_id === produtoId);
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!numero || !produtoId || !equipamentoId || qtdPlanejada === "" || qtdProduzida === "" || !inicio || !fim) {
        throw new Error("Preencha todos os campos obrigatórios");
      }
      const inicioIso = new Date(inicio).toISOString();
      const fimIso = new Date(fim).toISOString();
      if (new Date(fimIso).getTime() <= new Date(inicioIso).getTime()) {
        throw new Error("Fim deve ser posterior ao início");
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const durMin = Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000);
      const { data: inserted, error } = await supabase.from("ordens_producao").insert({
        owner_id: u.user.id,
        numero,
        produto_id: produtoId,
        equipamento_id: equipamentoId,
        qtd_planejada: Number(qtdPlanejada),
        qtd_produzida: Number(qtdProduzida),
        status: "finalizada",
        inicio_em: inicioIso,
        fim_em: fimIso,
        inicio_previsto: inicioIso,
        duracao_estimada_min: durMin,
        prioridade: "media",
        auto_iniciar: false,
        fila_posicao: null,
        obs_iniciais: obsIniciais || null,
        obs_finais: obsFinais || null,
        tanque_destino_id: tanqueId || null,
      }).select("id").single();
      if (error) throw error;
      if (lancarEstoque && tanqueId) {
        const { error: e2 } = await supabase.from("movimentacoes_estoque").insert({
          owner_id: u.user.id,
          produto_id: produtoId,
          tanque_id: tanqueId,
          tipo: "entrada",
          quantidade: Number(qtdProduzida),
          origem: `Produção OP ${numero} (manual)`,
          ordem_id: inserted!.id,
          ocorrido_em: fimIso,
        });
        if (e2) throw e2;
      }
      return inserted!.id as string;
    },
    onSuccess: () => {
      toast.success("Produção registrada manualmente");
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar produção manual</DialogTitle>
          <DialogDescription>
            Crie uma ordem já finalizada, para lançar produções realizadas fora do sistema (manutenção, indisponibilidade, etc.).
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Número da OP</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Equipamento</Label>
              <select value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)} required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— selecione —</option>
                {equipamentos.map((eq) => <option key={eq.id} value={eq.id}>{eq.codigo} — {eq.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Produto</Label>
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— selecione —</option>
                {(produtos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade planejada</Label>
              <Input type="number" step="any" value={qtdPlanejada}
                onChange={(e) => setQtdPlanejada(e.target.value === "" ? "" : Number(e.target.value))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade produzida</Label>
              <Input type="number" step="any" value={qtdProduzida}
                onChange={(e) => setQtdProduzida(e.target.value === "" ? "" : Number(e.target.value))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tanque de destino (opcional)</Label>
              <select value={tanqueId} onChange={(e) => setTanqueId(e.target.value)}
                disabled={!produtoId}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— sem tanque —</option>
                {(tanques.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>)}
              </select>
            </div>
            {tanqueId ? (
              <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-2">
                <div>
                  <Label className="text-sm">Lançar entrada no estoque</Label>
                  <div className="text-[11px] text-muted-foreground">Cria uma movimentação de entrada no tanque selecionado</div>
                </div>
                <Switch checked={lancarEstoque} onCheckedChange={setLancarEstoque} />
              </div>
            ) : null}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações iniciais</Label>
              <textarea value={obsIniciais} onChange={(e) => setObsIniciais(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações finais</Label>
              <textarea value={obsFinais} onChange={(e) => setObsFinais(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Registrar como finalizada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
