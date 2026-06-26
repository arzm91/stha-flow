import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Settings as SettingsIcon,
  Trash2,
  Wrench,
  FileText,
  Filter,
} from "lucide-react";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export const Route = createFileRoute("/_authenticated/turnos")({
  component: TurnosPage,
});

const CATEGORIAS = [
  { value: "geral", label: "Geral", icon: FileText, color: "bg-muted text-foreground" },
  { value: "operacao", label: "Operação", icon: SettingsIcon, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { value: "manutencao", label: "Manutenção", icon: Wrench, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { value: "ocorrencia", label: "Ocorrência", icon: AlertTriangle, color: "bg-destructive/10 text-destructive" },
  { value: "conclusao", label: "Conclusão", icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
] as const;

type Categoria = (typeof CATEGORIAS)[number]["value"];
const TURNOS = ["A", "B", "C", "D"] as const;
type TurnoLetra = (typeof TURNOS)[number];

function categoriaMeta(value: string) {
  return CATEGORIAS.find((c) => c.value === value) ?? CATEGORIAS[0];
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function TurnosPage() {
  const qc = useQueryClient();
  const { canEdit } = usePagePermissions();
  const editable = canEdit("turnos");

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("geral");
  const [turno, setTurno] = useState<TurnoLetra>("A");
  const [ocorridoEm, setOcorridoEm] = useState(() => toLocalInput(new Date()));

  // Filtros: últimos 7 dias por padrão
  const today = new Date();
  const sevenAgo = new Date();
  sevenAgo.setDate(today.getDate() - 7);
  const [dataInicio, setDataInicio] = useState(toDateInput(sevenAgo));
  const [dataFim, setDataFim] = useState(toDateInput(today));
  const [filtroTurno, setFiltroTurno] = useState<"todos" | TurnoLetra>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<"todas" | Categoria>("todas");

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ["turnos_eventos", dataInicio, dataFim, filtroTurno, filtroCategoria],
    queryFn: async () => {
      let q = supabase
        .from("relatorio_turno_eventos")
        .select("id, ocorrido_em, categoria, titulo, descricao, created_at")
        .order("ocorrido_em", { ascending: false });
      if (dataInicio) {
        q = q.gte("ocorrido_em", new Date(`${dataInicio}T00:00:00`).toISOString());
      }
      if (dataFim) {
        q = q.lte("ocorrido_em", new Date(`${dataFim}T23:59:59`).toISOString());
      }
      if (filtroCategoria !== "todas") {
        q = q.eq("categoria", filtroCategoria);
      }
      const { data, error } = await q;
      if (error) throw error;
      let rows = data ?? [];
      if (filtroTurno !== "todos") {
        rows = rows.filter((r) =>
          (r.descricao ?? "").startsWith(`[Turno ${filtroTurno}]`),
        );
      }
      return rows;
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      if (!titulo.trim()) throw new Error("Informe um título");
      const ts = new Date(ocorridoEm);
      if (isNaN(ts.getTime())) throw new Error("Data/hora inválida");
      const tag = `[Turno ${turno}]`;
      const body = descricao.trim();
      const finalDesc = body ? `${tag} ${body}` : tag;
      const { error } = await supabase.from("relatorio_turno_eventos").insert({
        owner_id: u.user.id,
        created_by: u.user.id,
        ocorrido_em: ts.toISOString(),
        categoria,
        titulo: titulo.trim(),
        descricao: finalDesc,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento registrado");
      setTitulo("");
      setDescricao("");
      setCategoria("geral");
      setOcorridoEm(toLocalInput(new Date()));
      qc.invalidateQueries({ queryKey: ["turnos_eventos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { guardAdmin } = await import("@/lib/security/guard-admin");
      await guardAdmin("excluir este evento de turno");
      const { error } = await supabase.from("relatorio_turno_eventos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento removido");
      qc.invalidateQueries({ queryKey: ["turnos_eventos"] });
    },
    onError: async (e: Error) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (!isAdminCancelled(e)) toast.error(e.message);
    },
  });

  const grupos = useMemo(() => {
    const map = new Map<string, typeof eventos>();
    for (const ev of eventos) {
      const d = new Date(ev.ocorrido_em);
      const key = d.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [eventos]);

  const setRangeShortcut = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDataInicio(toDateInput(start));
    setDataFim(toDateInput(end));
  };

  return (
    <div>
      <PageHeader
        title="Turnos"
        description="Registre as atividades e eventos de cada turno com data e hora. Filtre por período para revisar acontecimentos passados."
      />

      {editable && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate();
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-[1fr,140px,180px,220px]">
                <div className="space-y-1.5">
                  <Label htmlFor="titulo">Título</Label>
                  <Input
                    id="titulo"
                    placeholder="Ex.: Parada na linha 2 para limpeza"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Turno</Label>
                  <Select value={turno} onValueChange={(v) => setTurno(v as TurnoLetra)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TURNOS.map((t) => (
                        <SelectItem key={t} value={t}>
                          Turno {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={categoria} onValueChange={(v) => setCategoria(v as Categoria)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ocorrido">Data e hora</Label>
                  <Input
                    id="ocorrido"
                    type="datetime-local"
                    value={ocorridoEm}
                    onChange={(e) => setOcorridoEm(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  placeholder="Detalhes do que aconteceu, ações tomadas, responsáveis…"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={createMut.isPending}>
                  Registrar evento
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filtros
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ini" className="text-xs">De</Label>
              <Input
                id="ini"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fim" className="text-xs">Até</Label>
              <Input
                id="fim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Turno</Label>
              <Select value={filtroTurno} onValueChange={(v) => setFiltroTurno(v as typeof filtroTurno)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {TURNOS.map((t) => (
                    <SelectItem key={t} value={t}>Turno {t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select value={filtroCategoria} onValueChange={(v) => setFiltroCategoria(v as typeof filtroCategoria)}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRangeShortcut(0)}>Hoje</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRangeShortcut(7)}>7 dias</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRangeShortcut(30)}>30 dias</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <h2 className="text-lg font-semibold">Linha do tempo</h2>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : eventos.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhum evento encontrado para o período selecionado.
            </CardContent>
          </Card>
        ) : (
          grupos.map(([dia, items]) => (
            <div key={dia}>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="capitalize">{dia}</span>
              </div>
              <ol className="relative space-y-4 border-l border-border pl-6">
                {items.map((ev) => {
                  const meta = categoriaMeta(ev.categoria);
                  const Icon = meta.icon;
                  const dt = new Date(ev.ocorrido_em);
                  return (
                    <li key={ev.id} className="relative">
                      <span
                        className={`absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-background ${meta.color}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{ev.titulo}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {meta.label}
                                </Badge>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {dt.toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                              {ev.descricao && (
                                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                                  {ev.descricao}
                                </p>
                              )}
                            </div>
                            {editable && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm("Remover evento?")) deleteMut.mutate(ev.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
