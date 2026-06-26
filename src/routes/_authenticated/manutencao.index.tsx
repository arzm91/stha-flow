import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { KpiCard } from "@/components/KpiCard";
import { toast } from "sonner";
import {
  Wrench, Plus, Printer, Trash2, Calendar as CalendarIcon, Activity, Clock, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, addDays, addMonths, subMonths, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { gerarOSManutencaoPdf } from "@/lib/manutencao-pdf";
import { guardAdmin, isAdminCancelled } from "@/lib/security/guard-admin";

export const Route = createFileRoute("/_authenticated/manutencao/")({
  component: ManutencaoPage,
});

type Equip = { id: string; codigo: string; nome: string; status: string; localizacao: string | null; tipo: string | null };
type OS = {
  id: string; numero: string; equipamento_id: string; tipo: string; prioridade: string; status: string;
  data_abertura: string; data_inicio: string | null; data_conclusao: string | null; agendada_para: string | null;
  responsavel: string | null; descricao_problema: string | null; descricao_servico: string | null;
  pecas_utilizadas: string | null; custo: number | null; observacoes: string | null; preventiva_id: string | null;
};
type Preventiva = {
  id: string; equipamento_id: string; nome: string; descricao: string | null;
  tipo_recorrencia: "tempo" | "contador_op" | "data_fixa"; intervalo_dias: number | null;
  intervalo_op_count: number | null; proxima_execucao: string | null;
  checklist: { descricao: string }[]; responsavel_padrao: string | null; ativo: boolean; ultima_execucao: string | null;
};

const PRIORIDADES = ["baixa", "media", "alta", "critica"] as const;

function ManutencaoPage() {
  const qc = useQueryClient();
  const [osOpen, setOsOpen] = useState(false);
  const [osEditing, setOsEditing] = useState<OS | null>(null);
  const [equipPreset, setEquipPreset] = useState<string | undefined>();
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevEditing, setPrevEditing] = useState<Preventiva | null>(null);

  const equipamentos = useQuery({
    queryKey: ["mnt-equipamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("*").eq("ativo", true).order("codigo");
      if (error) throw error;
      return (data ?? []) as Equip[];
    },
    refetchInterval: 20_000,
  });

  const ordens = useQuery({
    queryKey: ["mnt-ordens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ordens_manutencao").select("*").order("data_abertura", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OS[];
    },
    refetchInterval: 20_000,
  });

  const preventivas = useQuery({
    queryKey: ["mnt-preventivas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("manutencao_preventivas").select("*").order("nome");
      if (error) throw error;
      return ((data ?? []) as unknown) as Preventiva[];
    },
  });

  const opsCount = useQuery({
    queryKey: ["mnt-ops-count"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data } = await supabase
        .from("ordens_producao")
        .select("id,equipamento_id,inicio_em,fim_em,qtd_planejada,qtd_produzida,status")
        .gte("inicio_em", since);
      return data ?? [];
    },
  });

  const osByEquip = useMemo(() => {
    const m = new Map<string, OS[]>();
    for (const o of ordens.data ?? []) {
      const arr = m.get(o.equipamento_id) ?? [];
      arr.push(o); m.set(o.equipamento_id, arr);
    }
    return m;
  }, [ordens.data]);

  const openOsForEquip = (equipId: string) => {
    setOsEditing(null);
    setEquipPreset(equipId);
    setOsOpen(true);
  };

  // Indicadores agregados (últimos 30 dias)
  const indicadores = useMemo(() => {
    const ops = opsCount.data ?? [];
    const oss = (ordens.data ?? []).filter((o) => o.data_abertura >= new Date(Date.now() - 30 * 86400_000).toISOString());

    // MTTR: média de (data_conclusao - data_inicio) das OSs corretivas concluídas
    const corretivas = oss.filter((o) => o.tipo === "corretiva" && o.data_inicio && o.data_conclusao);
    const mttrSec = corretivas.length
      ? corretivas.reduce((a, o) => a + (new Date(o.data_conclusao!).getTime() - new Date(o.data_inicio!).getTime()) / 1000, 0) / corretivas.length
      : 0;

    // MTBF: tempo total de produção dividido pelo nº de falhas corretivas
    const totalProdSec = ops.reduce((a, o) => {
      const end = o.fim_em ? new Date(o.fim_em).getTime() : Date.now();
      return a + Math.max(0, (end - new Date(o.inicio_em).getTime()) / 1000);
    }, 0);
    const mtbfSec = corretivas.length > 0 ? totalProdSec / corretivas.length : totalProdSec;

    // OEE simplificado: disponibilidade * performance * qualidade
    const downtime = corretivas.reduce((a, o) => a + (new Date(o.data_conclusao!).getTime() - new Date(o.data_inicio!).getTime()) / 1000, 0);
    const disponibilidade = totalProdSec > 0 ? Math.max(0, Math.min(1, (totalProdSec - downtime) / totalProdSec)) : 1;
    const planejado = ops.reduce((a, o) => a + Number(o.qtd_planejada ?? 0), 0);
    const produzido = ops.reduce((a, o) => a + Number(o.qtd_produzida ?? 0), 0);
    const qualidade = planejado > 0 ? Math.min(1, produzido / planejado) : 1;
    const performance = 0.95; // placeholder simples
    const oee = disponibilidade * performance * qualidade;

    return {
      mttrH: mttrSec / 3600,
      mtbfH: mtbfSec / 3600,
      oeePct: oee * 100,
      disponibilidadePct: disponibilidade * 100,
      abertas: (ordens.data ?? []).filter((o) => o.status === "aberta" || o.status === "em_andamento").length,
    };
  }, [opsCount.data, ordens.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manutenção"
        description="OEE, MTTR, MTBF, ordens de serviço corretivas e preventivas."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setPrevEditing(null); setPrevOpen(true); }}>
              <CalendarIcon className="mr-2 h-4 w-4" />Nova preventiva
            </Button>
            <Button onClick={() => { setOsEditing(null); setEquipPreset(undefined); setOsOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />Nova OS
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="OEE (30d)" value={`${indicadores.oeePct.toFixed(1)}%`} tone="primary" icon={<Activity className="h-4 w-4" />} hint="Disp × Perf × Qual" />
        <KpiCard label="Disponibilidade" value={`${indicadores.disponibilidadePct.toFixed(1)}%`} tone="success" />
        <KpiCard label="MTTR" value={`${indicadores.mttrH.toFixed(1)}h`} icon={<Clock className="h-4 w-4" />} hint="Tempo médio de reparo" />
        <KpiCard label="MTBF" value={`${indicadores.mtbfH.toFixed(1)}h`} icon={<CheckCircle2 className="h-4 w-4" />} hint="Tempo entre falhas" />
        <KpiCard label="OS Abertas" value={indicadores.abertas} tone={indicadores.abertas > 0 ? "warning" : "default"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="equipamentos">
        <TabsList>
          <TabsTrigger value="equipamentos">Equipamentos</TabsTrigger>
          <TabsTrigger value="ordens">Ordens de Serviço</TabsTrigger>
          <TabsTrigger value="preventivas">Preventivas</TabsTrigger>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
        </TabsList>

        {/* Equipamentos */}
        <TabsContent value="equipamentos" className="mt-4">
          {equipamentos.data && equipamentos.data.length === 0 ? (
            <EmptyState
              icon={<Wrench className="h-6 w-6" />}
              title="Nenhum equipamento ativo"
              description="Cadastre equipamentos para gerenciar manutenções."
              action={<Button asChild><Link to="/cadastros/equipamentos">Cadastrar equipamento</Link></Button>}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {equipamentos.data?.map((e) => {
                const osAtiva = (osByEquip.get(e.id) ?? []).find((o) => o.status === "aberta" || o.status === "em_andamento");
                return (
                  <Card key={e.id} className="flex flex-col">
                    <CardContent className="flex flex-1 flex-col p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-mono text-xs text-muted-foreground">{e.codigo}</div>
                          <div className="text-base font-semibold">{e.nome}</div>
                          <div className="text-xs text-muted-foreground">{e.localizacao ?? e.tipo ?? "—"}</div>
                        </div>
                        <EquipStatusBadge status={e.status} />
                      </div>
                      {osAtiva ? (
                        <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-2 text-sm">
                          <div className="font-medium">OS {osAtiva.numero} · {osAtiva.tipo}</div>
                          <div className="text-xs text-muted-foreground">
                            Status: {osAtiva.status} · Prioridade: {osAtiva.prioridade}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-muted-foreground">Sem OS aberta.</div>
                      )}
                      <div className="mt-4 flex justify-end gap-2">
                        {osAtiva ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => { setOsEditing(osAtiva); setOsOpen(true); }}>
                              Ver OS
                            </Button>
                            <Button size="sm" onClick={() => finalizarOS(osAtiva, qc)}>
                              <CheckCircle2 className="mr-1 h-4 w-4" />Finalizar
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => openOsForEquip(e.id)}>
                            <Wrench className="mr-1 h-4 w-4" />Abrir OS
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* OSs */}
        <TabsContent value="ordens" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-3">Nº</th><th className="p-3">Equipamento</th><th className="p-3">Tipo</th>
                      <th className="p-3">Prioridade</th><th className="p-3">Status</th>
                      <th className="p-3">Abertura</th><th className="p-3">Responsável</th><th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ordens.data ?? []).map((o) => {
                      const eq = equipamentos.data?.find((e) => e.id === o.equipamento_id);
                      return (
                        <tr key={o.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-mono">{o.numero}</td>
                          <td className="p-3">{eq ? `${eq.codigo} — ${eq.nome}` : "—"}</td>
                          <td className="p-3"><Badge variant="outline">{o.tipo}</Badge></td>
                          <td className="p-3"><PrioridadeBadge p={o.prioridade} /></td>
                          <td className="p-3"><OsStatusBadge s={o.status} /></td>
                          <td className="p-3 text-xs">{format(parseISO(o.data_abertura), "dd/MM/yy HH:mm")}</td>
                          <td className="p-3 text-xs">{o.responsavel ?? "—"}</td>
                          <td className="p-3 text-right">
                            <Button size="sm" variant="ghost" onClick={() => { setOsEditing(o); setOsOpen(true); }}>Abrir</Button>
                            <Button size="sm" variant="ghost" onClick={() => gerarOSManutencaoPdf(o.id).catch((e) => toast.error(e.message))}>
                              <Printer className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {(ordens.data ?? []).length === 0 && (
                      <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhuma OS registrada.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preventivas */}
        <TabsContent value="preventivas" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            {(preventivas.data ?? []).map((p) => {
              const eq = equipamentos.data?.find((e) => e.id === p.equipamento_id);
              return (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-base font-semibold">{p.nome}</div>
                        <div className="text-xs text-muted-foreground">{eq ? `${eq.codigo} — ${eq.nome}` : "—"}</div>
                        <div className="mt-1 text-xs">
                          <Badge variant="outline">{recorrenciaLabel(p)}</Badge>{" "}
                          {p.proxima_execucao && <Badge variant="outline">Próx: {format(parseISO(p.proxima_execucao), "dd/MM/yy")}</Badge>}
                          {!p.ativo && <Badge variant="outline" className="ml-1">Inativa</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => gerarOrdemPreventiva(p, qc)}>
                          Gerar OS
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setPrevEditing(p); setPrevOpen(true); }}>
                          Editar
                        </Button>
                      </div>
                    </div>
                    {p.descricao && <p className="mt-2 text-sm text-muted-foreground">{p.descricao}</p>}
                    {p.checklist?.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                        {p.checklist.slice(0, 5).map((c, i) => <li key={i}>{c.descricao}</li>)}
                        {p.checklist.length > 5 && <li>+{p.checklist.length - 5} item(s)</li>}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {(preventivas.data ?? []).length === 0 && (
              <EmptyState
                icon={<CalendarIcon className="h-6 w-6" />}
                title="Nenhuma rotina preventiva"
                description="Crie rotinas para gerar OSs preventivas automaticamente."
                action={<Button onClick={() => { setPrevEditing(null); setPrevOpen(true); }}><Plus className="mr-2 h-4 w-4" />Criar rotina</Button>}
              />
            )}
          </div>
        </TabsContent>

        {/* Calendário */}
        <TabsContent value="calendario" className="mt-4">
          <MaintenanceCalendar
            oss={ordens.data ?? []}
            preventivas={preventivas.data ?? []}
            equipamentos={equipamentos.data ?? []}
            onOpenOs={(o) => { setOsEditing(o); setOsOpen(true); }}
          />
        </TabsContent>
      </Tabs>

      <OSDialog
        open={osOpen}
        onOpenChange={setOsOpen}
        editing={osEditing}
        equipPreset={equipPreset}
        equipamentos={equipamentos.data ?? []}
      />
      <PreventivaDialog
        open={prevOpen}
        onOpenChange={setPrevOpen}
        editing={prevEditing}
        equipamentos={equipamentos.data ?? []}
      />
    </div>
  );
}

function recorrenciaLabel(p: Preventiva): string {
  if (p.tipo_recorrencia === "tempo") return `A cada ${p.intervalo_dias ?? "?"} dia(s)`;
  if (p.tipo_recorrencia === "contador_op") return `A cada ${p.intervalo_op_count ?? "?"} OP(s)`;
  return "Data fixa";
}

function EquipStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    disponivel: { label: "Disponível", cls: "bg-success/20 text-success border-success/30" },
    ocupado: { label: "Ocupado", cls: "bg-primary/20 text-primary border-primary/30" },
    parado: { label: "Parado", cls: "bg-warning/20 text-warning border-warning/30" },
    manutencao: { label: "Manutenção", cls: "bg-destructive/20 text-destructive border-destructive/30" },
  };
  const v = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
}

function PrioridadeBadge({ p }: { p: string }) {
  const map: Record<string, string> = {
    baixa: "bg-muted text-muted-foreground",
    media: "bg-primary/10 text-primary border-primary/30",
    alta: "bg-warning/20 text-warning border-warning/30",
    critica: "bg-destructive/20 text-destructive border-destructive/30",
  };
  return <Badge variant="outline" className={map[p] ?? ""}>{p}</Badge>;
}
function OsStatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    aberta: "bg-warning/20 text-warning border-warning/30",
    em_andamento: "bg-primary/20 text-primary border-primary/30",
    concluida: "bg-success/20 text-success border-success/30",
    cancelada: "bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={map[s] ?? ""}>{s.replace("_", " ")}</Badge>;
}

async function gerarOrdemPreventiva(p: Preventiva, qc: ReturnType<typeof useQueryClient>) {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Não autenticado");
    const numero = `PV-${Date.now().toString().slice(-6)}`;
    const { data: os, error } = await supabase
      .from("ordens_manutencao")
      .insert({
        owner_id: u.user.id,
        numero,
        equipamento_id: p.equipamento_id,
        tipo: "preventiva",
        prioridade: "media",
        status: "aberta",
        preventiva_id: p.id,
        agendada_para: p.proxima_execucao ? new Date(p.proxima_execucao).toISOString() : new Date().toISOString(),
        responsavel: p.responsavel_padrao,
        descricao_servico: p.descricao,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (p.checklist?.length) {
      await supabase.from("manutencao_atividades").insert(
        p.checklist.map((c, i) => ({
          owner_id: u.user!.id,
          ordem_id: os.id,
          descricao: c.descricao,
          ordem_seq: i,
        })),
      );
    }
    toast.success(`OS ${numero} criada`);
    qc.invalidateQueries({ queryKey: ["mnt-ordens"] });
  } catch (e) {
    toast.error((e as Error).message);
  }
}

async function finalizarOS(os: OS, qc: ReturnType<typeof useQueryClient>) {
  try {
    if (os.status === "concluida" || os.status === "cancelada") {
      toast.info("OS já finalizada");
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("ordens_manutencao")
      .update({
        status: "concluida",
        data_inicio: os.data_inicio ?? now,
        data_conclusao: now,
      })
      .eq("id", os.id);
    if (error) throw error;
    if (os.tipo === "corretiva") {
      await supabase.from("equipamentos").update({ status: "disponivel" }).eq("id", os.equipamento_id);
    }
    toast.success(`OS ${os.numero} finalizada — equipamento disponível`);
    qc.invalidateQueries({ queryKey: ["mnt-ordens"] });
    qc.invalidateQueries({ queryKey: ["mnt-equipamentos"] });
    qc.invalidateQueries({ queryKey: ["equipamentos"] });
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// ============ OS Dialog ============
function OSDialog({
  open, onOpenChange, editing, equipPreset, equipamentos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: OS | null;
  equipPreset?: string;
  equipamentos: Equip[];
}) {
  const qc = useQueryClient();
  const isEdit = !!editing;
  const [form, setForm] = useState({
    numero: "", equipamento_id: "", tipo: "corretiva", prioridade: "media", status: "aberta",
    responsavel: "", descricao_problema: "", descricao_servico: "", pecas_utilizadas: "", custo: "", observacoes: "",
    agendada_para: "",
  });

  const atividades = useQuery({
    queryKey: ["mnt-atividades", editing?.id],
    enabled: !!editing?.id,
    queryFn: async () => {
      const { data } = await supabase.from("manutencao_atividades").select("*").eq("ordem_id", editing!.id).order("ordem_seq");
      return data ?? [];
    },
  });

  // Init form when opening
  useMemo(() => {
    if (!open) return;
    if (editing) {
      setForm({
        numero: editing.numero,
        equipamento_id: editing.equipamento_id,
        tipo: editing.tipo,
        prioridade: editing.prioridade,
        status: editing.status,
        responsavel: editing.responsavel ?? "",
        descricao_problema: editing.descricao_problema ?? "",
        descricao_servico: editing.descricao_servico ?? "",
        pecas_utilizadas: editing.pecas_utilizadas ?? "",
        custo: editing.custo != null ? String(editing.custo) : "",
        observacoes: editing.observacoes ?? "",
        agendada_para: editing.agendada_para ? editing.agendada_para.slice(0, 16) : "",
      });
    } else {
      setForm({
        numero: `OS-${Date.now().toString().slice(-6)}`,
        equipamento_id: equipPreset ?? "",
        tipo: "corretiva", prioridade: "media", status: "aberta",
        responsavel: "", descricao_problema: "", descricao_servico: "", pecas_utilizadas: "",
        custo: "", observacoes: "", agendada_para: "",
      });
    }
  }, [open, editing, equipPreset]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.equipamento_id) throw new Error("Selecione o equipamento");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const payload = {
        numero: form.numero,
        equipamento_id: form.equipamento_id,
        tipo: form.tipo,
        prioridade: form.prioridade,
        status: form.status,
        responsavel: form.responsavel || null,
        descricao_problema: form.descricao_problema || null,
        descricao_servico: form.descricao_servico || null,
        pecas_utilizadas: form.pecas_utilizadas || null,
        custo: form.custo ? Number(form.custo) : null,
        observacoes: form.observacoes || null,
        agendada_para: form.agendada_para ? new Date(form.agendada_para).toISOString() : null,
        data_inicio: form.status === "em_andamento" || form.status === "concluida"
          ? (editing?.data_inicio ?? new Date().toISOString()) : editing?.data_inicio ?? null,
        data_conclusao: form.status === "concluida"
          ? (editing?.data_conclusao ?? new Date().toISOString()) : null,
      };

      let osId: string;
      if (isEdit) {
        const { error } = await supabase.from("ordens_manutencao").update(payload).eq("id", editing!.id);
        if (error) throw error;
        osId = editing!.id;
      } else {
        const { data, error } = await supabase
          .from("ordens_manutencao")
          .insert({ ...payload, owner_id: u.user.id })
          .select("id").single();
        if (error) throw error;
        osId = data.id;
      }

      // Bloqueio do equipamento: corretiva em andamento => 'manutencao'; corretiva concluída => 'disponivel'
      if (form.tipo === "corretiva") {
        if (form.status === "aberta" || form.status === "em_andamento") {
          await supabase.from("equipamentos").update({ status: "manutencao" }).eq("id", form.equipamento_id);
        } else if (form.status === "concluida" || form.status === "cancelada") {
          await supabase.from("equipamentos").update({ status: "disponivel" }).eq("id", form.equipamento_id);
        }
      }

      return osId;
    },
    onSuccess: () => {
      toast.success(isEdit ? "OS atualizada" : "OS criada");
      qc.invalidateQueries({ queryKey: ["mnt-ordens"] });
      qc.invalidateQueries({ queryKey: ["mnt-equipamentos"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await guardAdmin("Excluir ordem de serviço");
      if (!editing) return;
      const { error } = await supabase.from("ordens_manutencao").delete().eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("OS excluída");
      qc.invalidateQueries({ queryKey: ["mnt-ordens"] });
      onOpenChange(false);
    },
    onError: (e) => { if (!isAdminCancelled(e)) toast.error((e as Error).message); },
  });

  const [novaAtv, setNovaAtv] = useState("");
  const addAtividade = useMutation({
    mutationFn: async () => {
      if (!editing || !novaAtv.trim()) return;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("manutencao_atividades").insert({
        owner_id: u.user!.id, ordem_id: editing.id, descricao: novaAtv.trim(),
        ordem_seq: (atividades.data?.length ?? 0),
      });
      if (error) throw error;
    },
    onSuccess: () => { setNovaAtv(""); atividades.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `OS ${editing!.numero}` : "Nova Ordem de Serviço"}</DialogTitle>
          <DialogDescription>Descreva o problema, atividades realizadas e finalize quando concluída.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Equipamento</Label>
              <select value={form.equipamento_id} onChange={(e) => setForm({ ...form, equipamento_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                <option value="">— selecione —</option>
                {equipamentos.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="corretiva">Corretiva</option>
                <option value="preventiva">Preventiva</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="aberta">Aberta</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Agendada para</Label>
              <Input type="datetime-local" value={form.agendada_para} onChange={(e) => setForm({ ...form, agendada_para: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Custo (R$)</Label>
              <Input type="number" step="0.01" value={form.custo} onChange={(e) => setForm({ ...form, custo: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição do problema</Label>
            <Textarea value={form.descricao_problema} onChange={(e) => setForm({ ...form, descricao_problema: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Atividades realizadas / serviço</Label>
            <Textarea value={form.descricao_servico} onChange={(e) => setForm({ ...form, descricao_servico: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Peças utilizadas</Label>
              <Textarea value={form.pecas_utilizadas} onChange={(e) => setForm({ ...form, pecas_utilizadas: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>

          {isEdit && (
            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-semibold">Checklist de atividades</div>
              <div className="space-y-2">
                {(atividades.data ?? []).map((a) => (
                  <ChecklistItem key={a.id} item={a} onChange={() => atividades.refetch()} />
                ))}
                {(atividades.data ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum item de checklist.</p>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Input placeholder="Nova atividade..." value={novaAtv} onChange={(e) => setNovaAtv(e.target.value)} />
                <Button type="button" size="sm" onClick={() => addAtividade.mutate()} disabled={!novaAtv.trim()}>Adicionar</Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {isEdit && (
              <>
                <Button type="button" variant="outline" onClick={() => gerarOSManutencaoPdf(editing!.id).catch((e) => toast.error(e.message))}>
                  <Printer className="mr-2 h-4 w-4" />Imprimir
                </Button>
                <Button type="button" variant="destructive" onClick={() => remove.mutate()}>
                  <Trash2 className="mr-2 h-4 w-4" />Excluir
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistItem({ item, onChange }: { item: { id: string; descricao: string; realizada: boolean; observacao: string | null }; onChange: () => void }) {
  const [obs, setObs] = useState(item.observacao ?? "");
  const toggle = async (v: boolean) => {
    await supabase.from("manutencao_atividades").update({ realizada: v }).eq("id", item.id);
    onChange();
  };
  const saveObs = async () => {
    await supabase.from("manutencao_atividades").update({ observacao: obs || null }).eq("id", item.id);
    onChange();
  };
  const remove = async () => {
    await supabase.from("manutencao_atividades").delete().eq("id", item.id);
    onChange();
  };
  return (
    <div className="flex items-start gap-2 rounded border p-2">
      <Checkbox checked={item.realizada} onCheckedChange={(v) => toggle(!!v)} className="mt-1" />
      <div className="flex-1">
        <div className={item.realizada ? "text-sm line-through text-muted-foreground" : "text-sm"}>{item.descricao}</div>
        <Input className="mt-1 h-7 text-xs" placeholder="Observação..." value={obs} onChange={(e) => setObs(e.target.value)} onBlur={saveObs} />
      </div>
      <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="h-3 w-3" /></Button>
    </div>
  );
}

// ============ Preventiva Dialog ============
function PreventivaDialog({
  open, onOpenChange, editing, equipamentos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Preventiva | null;
  equipamentos: Equip[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nome: "", descricao: "", equipamento_id: "", tipo_recorrencia: "tempo" as "tempo" | "contador_op" | "data_fixa",
    intervalo_dias: "", intervalo_op_count: "", proxima_execucao: "",
    responsavel_padrao: "", ativo: true,
    checklist: [] as { descricao: string }[],
  });
  const [novoItem, setNovoItem] = useState("");

  useMemo(() => {
    if (!open) return;
    if (editing) {
      setForm({
        nome: editing.nome, descricao: editing.descricao ?? "",
        equipamento_id: editing.equipamento_id,
        tipo_recorrencia: editing.tipo_recorrencia,
        intervalo_dias: editing.intervalo_dias?.toString() ?? "",
        intervalo_op_count: editing.intervalo_op_count?.toString() ?? "",
        proxima_execucao: editing.proxima_execucao ?? "",
        responsavel_padrao: editing.responsavel_padrao ?? "",
        ativo: editing.ativo,
        checklist: editing.checklist ?? [],
      });
    } else {
      setForm({
        nome: "", descricao: "", equipamento_id: "", tipo_recorrencia: "tempo",
        intervalo_dias: "30", intervalo_op_count: "", proxima_execucao: "",
        responsavel_padrao: "", ativo: true, checklist: [],
      });
    }
  }, [open, editing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome || !form.equipamento_id) throw new Error("Nome e equipamento são obrigatórios");
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        nome: form.nome,
        descricao: form.descricao || null,
        equipamento_id: form.equipamento_id,
        tipo_recorrencia: form.tipo_recorrencia,
        intervalo_dias: form.intervalo_dias ? Number(form.intervalo_dias) : null,
        intervalo_op_count: form.intervalo_op_count ? Number(form.intervalo_op_count) : null,
        proxima_execucao: form.proxima_execucao || null,
        responsavel_padrao: form.responsavel_padrao || null,
        ativo: form.ativo,
        checklist: form.checklist,
      };
      if (editing) {
        const { error } = await supabase.from("manutencao_preventivas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("manutencao_preventivas").insert({ ...payload, owner_id: u.user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Rotina atualizada" : "Rotina criada");
      qc.invalidateQueries({ queryKey: ["mnt-preventivas"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await guardAdmin("Excluir rotina preventiva");
      if (!editing) return;
      const { error } = await supabase.from("manutencao_preventivas").delete().eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rotina excluída");
      qc.invalidateQueries({ queryKey: ["mnt-preventivas"] });
      onOpenChange(false);
    },
    onError: (e) => { if (!isAdminCancelled(e)) toast.error((e as Error).message); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar rotina preventiva" : "Nova rotina preventiva"}</DialogTitle>
          <DialogDescription>Cadastre a recorrência e os itens de verificação.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Equipamento</Label>
              <select value={form.equipamento_id} onChange={(e) => setForm({ ...form, equipamento_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                <option value="">— selecione —</option>
                {equipamentos.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Recorrência</Label>
              <select value={form.tipo_recorrencia}
                onChange={(e) => setForm({ ...form, tipo_recorrencia: e.target.value as "tempo" | "contador_op" | "data_fixa" })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="tempo">Por tempo (dias)</option>
                <option value="contador_op">Por contador de OPs</option>
                <option value="data_fixa">Data fixa</option>
              </select>
            </div>
            {form.tipo_recorrencia === "tempo" && (
              <div className="space-y-1.5">
                <Label>Intervalo (dias)</Label>
                <Input type="number" value={form.intervalo_dias} onChange={(e) => setForm({ ...form, intervalo_dias: e.target.value })} />
              </div>
            )}
            {form.tipo_recorrencia === "contador_op" && (
              <div className="space-y-1.5">
                <Label>Intervalo (OPs)</Label>
                <Input type="number" value={form.intervalo_op_count} onChange={(e) => setForm({ ...form, intervalo_op_count: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Próxima execução</Label>
              <Input type="date" value={form.proxima_execucao} onChange={(e) => setForm({ ...form, proxima_execucao: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável padrão</Label>
              <Input value={form.responsavel_padrao} onChange={(e) => setForm({ ...form, responsavel_padrao: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: !!v })} id="ativo" />
              <Label htmlFor="ativo">Ativa</Label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-semibold">Itens do checklist</div>
            <ul className="space-y-1">
              {form.checklist.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">• {c.descricao}</span>
                  <Button type="button" size="sm" variant="ghost"
                    onClick={() => setForm({ ...form, checklist: form.checklist.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Input placeholder="Ex.: Verificar nível de óleo" value={novoItem} onChange={(e) => setNovoItem(e.target.value)} />
              <Button type="button" size="sm" onClick={() => {
                if (!novoItem.trim()) return;
                setForm({ ...form, checklist: [...form.checklist, { descricao: novoItem.trim() }] });
                setNovoItem("");
              }}>Adicionar</Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            {editing && (
              <Button type="button" variant="destructive" onClick={() => remove.mutate()}>
                <Trash2 className="mr-2 h-4 w-4" />Excluir
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ Calendar ============
function MaintenanceCalendar({
  oss, preventivas, equipamentos, onOpenOs,
}: {
  oss: OS[];
  preventivas: Preventiva[];
  equipamentos: Equip[];
  onOpenOs: (o: OS) => void;
}) {
  const [cursor, setCursor] = useState(new Date());
  const start = startOfMonth(cursor);
  const end = endOfMonth(cursor);

  const days: Date[] = [];
  const startWeekday = start.getDay();
  for (let i = 0; i < startWeekday; i++) days.push(addDays(start, i - startWeekday));
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(new Date(d));
  while (days.length % 7 !== 0) days.push(addDays(days[days.length - 1], 1));

  const eventsOn = (d: Date) => {
    const o = oss.filter((x) => {
      const date = x.agendada_para ? parseISO(x.agendada_para) : null;
      return date && isSameDay(date, d);
    });
    const p = preventivas.filter((x) => x.proxima_execucao && isSameDay(parseISO(x.proxima_execucao), d));
    return { o, p };
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setCursor(subMonths(cursor, 1))}>‹</Button>
          <div className="font-semibold">{format(cursor, "MMMM yyyy", { locale: ptBR })}</div>
          <Button variant="ghost" size="sm" onClick={() => setCursor(addMonths(cursor, 1))}>›</Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => <div key={d} className="p-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const { o, p } = eventsOn(d);
            return (
              <div key={i} className={`min-h-[80px] rounded border p-1 text-xs ${inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground"}`}>
                <div className="font-mono">{format(d, "d")}</div>
                <div className="mt-1 space-y-1">
                  {o.map((x) => (
                    <button key={x.id} onClick={() => onOpenOs(x)}
                      className="w-full truncate rounded bg-warning/20 px-1 py-0.5 text-left text-[10px] text-warning hover:bg-warning/30">
                      OS {x.numero}
                    </button>
                  ))}
                  {p.map((x) => {
                    const eq = equipamentos.find((e) => e.id === x.equipamento_id);
                    return (
                      <div key={x.id} className="truncate rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary">
                        PV: {eq?.codigo ?? ""} {x.nome}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
