import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle2, Gauge, FlaskConical, MessageSquare, Activity, AlertTriangle, Play, Square, ListChecks, Clock, History, Maximize2, Minimize2, FileText, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber, durationFromNow, durationBetween } from "@/lib/format";
import { ScadaViewer } from "@/components/scada/ScadaViewer";
import { TagsMonitoramento } from "@/components/producao/TagsMonitoramento";
import { UtilidadesLive, UtilidadesStrip } from "@/components/producao/UtilidadesLive";
import { gerarRelatorioProducaoPdf } from "@/lib/producao-pdf";
import { gerarRelatorioProducaoXlsx } from "@/lib/producao-xlsx";
import type { SheetColumn as SheetCol } from "@/lib/tabelas/types";

export const Route = createFileRoute("/_authenticated/producao/$id")({
  component: OPPage,
});

function OPPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const op = useQuery({
    queryKey: ["op", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_producao")
        .select("*, produto:produto_id(id,nome,codigo,unidade), equipamento:equipamento_id(id,codigo,nome,tag_nomes,tag_velocidade_producao,tag_producao_total), tanque:tanque_destino_id(nome,codigo)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 10_000,
  });

  const operador = useQuery({
    queryKey: ["operador", op.data?.owner_id],
    enabled: !!op.data?.owner_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nome,email").eq("id", op.data!.owner_id).maybeSingle();
      return data;
    },
  });

  const parametros = useQuery({
    queryKey: ["params", id],
    queryFn: async () => {
      const { data } = await supabase.from("parametros_registrados")
        .select("*, parametro:parametro_id(nome,unidade,valor_min,valor_max)")
        .eq("ordem_id", id).order("registrado_em", { ascending: false });
      return data ?? [];
    },
  });
  const analises = useQuery({
    queryKey: ["analises", id],
    queryFn: async () => {
      const { data } = await supabase.from("analises_registradas")
        .select("*, analise:analise_id(nome,unidade,valor_min,valor_max)")
        .eq("ordem_id", id).order("registrado_em", { ascending: false });
      return data ?? [];
    },
  });
  const observacoes = useQuery({
    queryKey: ["obs", id],
    queryFn: async () => {
      const { data } = await supabase.from("observacoes_producao")
        .select("*").eq("ordem_id", id).order("registrado_em", { ascending: false });
      return data ?? [];
    },
  });

  // catalogs
  const paramCat = useQuery({ queryKey: ["param-cat"], queryFn: async () => (await supabase.from("parametros_cadastro").select("id,nome,unidade").order("nome")).data ?? [] });
  const anlCat = useQuery({ queryKey: ["anl-cat"], queryFn: async () => (await supabase.from("analises_cadastro").select("id,nome,unidade").order("nome")).data ?? [] });
  const tanquesProd = useQuery({
    queryKey: ["tanques-produto", op.data?.produto_id],
    enabled: !!op.data,
    queryFn: async () => {
      const { data } = await supabase.from("tanques").select("id,codigo,nome,produto_id").order("codigo");
      return (data ?? []).filter((t) => !t.produto_id || t.produto_id === op.data!.produto_id);
    },
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFs = async () => {
    try {
      if (!document.fullscreenElement) await containerRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch (err) {
      toast.error("Tela cheia indisponível: " + (err as Error).message);
    }
  };

  if (op.isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!op.data) return <div className="text-sm text-muted-foreground">Ordem não encontrada.</div>;

  const isFinal = op.data.status === "finalizada";
  const equip = op.data.equipamento as { tag_nomes?: string[]; tag_velocidade_producao?: string | null; tag_producao_total?: string | null; nome?: string } | null;
  const tagNomes = (equip?.tag_nomes ?? []) as string[];
  const tagVel = equip?.tag_velocidade_producao || null;
  const tagTotal = equip?.tag_producao_total || null;
  const qtdPlanejada = Number(op.data.qtd_planejada ?? 0);

  return (
    <div ref={containerRef} className={isFs ? "h-screen w-screen overflow-auto bg-background p-6" : undefined}>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/producao"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
      </Button>
      <PageHeader
        title={`OP ${op.data.numero}`}
        description={`${(op.data.produto as any)?.nome ?? ""} · ${equip?.nome ?? ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={isFinal ? "bg-success/20 text-success border-success/30" : "bg-primary/20 text-primary border-primary/30"}>
              {isFinal ? "Finalizada" : "Em andamento"}
            </Badge>
            <Button variant="outline" size="sm" onClick={toggleFs} title={isFs ? "Sair da tela cheia" : "Tela cheia"}>
              {isFs ? <Minimize2 className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
              {isFs ? "Sair" : "Tela cheia"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try { await gerarRelatorioProducaoPdf(id); toast.success("Relatório PDF gerado"); }
                catch (e) { toast.error("Falha ao gerar PDF: " + (e as Error).message); }
              }}
              title="Emitir relatório PDF da produção"
            >
              <FileText className="mr-1 h-4 w-4" /> Relatório PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try { await gerarRelatorioProducaoXlsx(id); toast.success("Excel gerado"); }
                catch (e) { toast.error("Falha ao gerar Excel: " + (e as Error).message); }
              }}
              title="Exportar timeline e histórico para Excel"
            >
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Exportar Excel
            </Button>
            {!isFinal && <FinalizarDialog op={op.data} tanques={tanquesProd.data ?? []} onDone={() => { qc.invalidateQueries(); navigate({ to: "/producao" }); }} />}
          </div>
        }
      />

      {op.data.equipamento_id ? <UtilidadesStrip equipamentoId={op.data.equipamento_id as string} /> : null}

      {(tagVel || tagTotal) ? (
        <AvancoProducaoHeader ordemId={id} tagVel={tagVel} tagTotal={tagTotal} qtdPlanejada={qtdPlanejada} />
      ) : null}

      {op.data.inicio_em && !isFinal ? (
        <TempoProducaoHeader
          inicioEm={op.data.inicio_em as string}
          duracaoEstimadaMin={(op.data as any).duracao_estimada_min ?? null}
        />
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Info label="Início" value={op.data.inicio_em ? formatDate(op.data.inicio_em) : "—"} />
        <Info label="Fim" value={op.data.fim_em ? formatDate(op.data.fim_em) : "—"} />
        <Info label="Duração total" value={op.data.inicio_em ? (op.data.fim_em ? durationBetween(op.data.inicio_em, op.data.fim_em) : durationFromNow(op.data.inicio_em)) : "—"} />
        <Info label="Qtd. planejada / produzida" value={`${formatNumber(Number(op.data.qtd_planejada))} / ${op.data.qtd_produzida != null ? formatNumber(Number(op.data.qtd_produzida)) : "—"}`} />
        <Info label="Operador" value={operador.data?.nome ?? "—"} />
        <Info label="Equipamento" value={equip?.nome ?? "—"} />
      </div>

      {op.data.equipamento_id ? <ScadaViewer equipamentoId={op.data.equipamento_id as string} /> : null}

      {op.data.equipamento_id ? <UtilidadesLive equipamentoId={op.data.equipamento_id as string} /> : null}

      <TagsMonitoramento ordemId={id} tagNomes={tagNomes} ativa={!isFinal} />

      {(op.data.obs_iniciais || op.data.obs_finais) ? (
        <Card className="mb-4">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2">
            {op.data.obs_iniciais ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Observações iniciais</div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{op.data.obs_iniciais}</div>
              </div>
            ) : null}
            {op.data.obs_finais ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Observações finais</div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{op.data.obs_finais}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <TagsDoEquipamento tagNomes={tagNomes} ordemId={id} disabled={isFinal} />

      <Tabs defaultValue="processos">
        <TabsList>
          <TabsTrigger value="processos"><ListChecks className="mr-1 h-4 w-4" />Processos</TabsTrigger>
          <TabsTrigger value="parametros"><Gauge className="mr-1 h-4 w-4" />Parâmetros</TabsTrigger>
          <TabsTrigger value="analises"><FlaskConical className="mr-1 h-4 w-4" />Análises</TabsTrigger>
          <TabsTrigger value="observacoes"><MessageSquare className="mr-1 h-4 w-4" />Observações</TabsTrigger>
          <TabsTrigger value="historico"><History className="mr-1 h-4 w-4" />Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="processos">
          <ProcessosSection ordemId={id} equipamentoId={(op.data as any).equipamento_id ?? null} />
        </TabsContent>


        <TabsContent value="parametros">
          <RegistroSection
            disabled={isFinal}
            label="parâmetro"
            options={paramCat.data ?? []}
            valueLabel="Valor"
            onSubmit={async (refId, valor) => {
              const { data: u } = await supabase.auth.getUser();
              if (!u.user) throw new Error("Não autenticado");
              const { error } = await supabase.from("parametros_registrados").insert({
                owner_id: u.user.id, ordem_id: id, parametro_id: refId, valor: Number(valor),
              });
              if (error) throw error;
              qc.invalidateQueries({ queryKey: ["params", id] });
            }}
            rows={(parametros.data ?? []).map((p) => ({
              id: p.id, when: p.registrado_em, name: (p.parametro as any)?.nome, unit: (p.parametro as any)?.unidade, value: Number(p.valor),
            }))}
          />
        </TabsContent>

        <TabsContent value="analises">
          <RegistroSection
            disabled={isFinal}
            label="análise"
            options={anlCat.data ?? []}
            valueLabel="Resultado"
            onSubmit={async (refId, valor) => {
              const { data: u } = await supabase.auth.getUser();
              if (!u.user) throw new Error("Não autenticado");
              const { error } = await supabase.from("analises_registradas").insert({
                owner_id: u.user.id, ordem_id: id, analise_id: refId, resultado: Number(valor),
              });
              if (error) throw error;
              qc.invalidateQueries({ queryKey: ["analises", id] });
            }}
            rows={(analises.data ?? []).map((p) => ({
              id: p.id, when: p.registrado_em, name: (p.analise as any)?.nome, unit: (p.analise as any)?.unidade, value: Number(p.resultado),
            }))}
          />
        </TabsContent>

        <TabsContent value="observacoes">
          <ObservacoesSection
            disabled={isFinal}
            rows={observacoes.data ?? []}
            onAdd={async (texto) => {
              const { data: u } = await supabase.auth.getUser();
              if (!u.user) throw new Error("Não autenticado");
              const { error } = await supabase.from("observacoes_producao").insert({
                owner_id: u.user.id, ordem_id: id, texto,
              });
              if (error) throw error;
              qc.invalidateQueries({ queryKey: ["obs", id] });
            }}
          />
        </TabsContent>

        <TabsContent value="historico">
          <TimelineUnificada ordemId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TimelineUnificada({ ordemId }: { ordemId: string }) {
  const opQ = useQuery({
    queryKey: ["op-times-equip", ordemId],
    queryFn: async () => {
      const { data } = await supabase.from("ordens_producao")
        .select("equipamento_id,inicio_em,fim_em").eq("id", ordemId).maybeSingle();
      return data;
    },
  });
  const parametros = useQuery({
    queryKey: ["params", ordemId],
    queryFn: async () => {
      const { data } = await supabase.from("parametros_registrados")
        .select("*, parametro:parametro_id(nome,unidade)")
        .eq("ordem_id", ordemId).order("registrado_em", { ascending: false });
      return data ?? [];
    },
  });
  const analises = useQuery({
    queryKey: ["analises", ordemId],
    queryFn: async () => {
      const { data } = await supabase.from("analises_registradas")
        .select("*, analise:analise_id(nome,unidade)")
        .eq("ordem_id", ordemId).order("registrado_em", { ascending: false });
      return data ?? [];
    },
  });
  const observacoes = useQuery({
    queryKey: ["obs", ordemId],
    queryFn: async () => {
      const { data } = await supabase.from("observacoes_producao")
        .select("*").eq("ordem_id", ordemId).order("registrado_em", { ascending: false });
      return data ?? [];
    },
  });
  const etapas = useQuery({
    queryKey: ["ordem-etapas", ordemId],
    queryFn: async () => {
      const { data } = await supabase.from("ordem_etapas")
        .select("*").eq("ordem_id", ordemId).order("iniciado_em", { ascending: false });
      return data ?? [];
    },
  });

  const equipId = opQ.data?.equipamento_id ?? null;
  const inicioEm = opQ.data?.inicio_em ?? null;
  const fimEm = opQ.data?.fim_em ?? null;
  const tabelasRows = useQuery({
    queryKey: ["timeline-custom-sheet-rows", ordemId, equipId, inicioEm, fimEm],
    enabled: !!equipId && !!inicioEm,
    queryFn: async () => {
      const sheets = await supabase
        .from("custom_sheets")
        .select("id,nome,columns")
        .contains("equipamento_ids", [equipId!] as never);
      if (sheets.error) throw sheets.error;
      const list = sheets.data ?? [];
      if (list.length === 0) return [] as Array<{ id: string; sheet_id: string; sheet_nome: string; columns: SheetCol[]; data: Record<string, unknown>; created_at: string }>;
      const ids = list.map((s) => s.id);
      let q = supabase
        .from("custom_sheet_rows")
        .select("id,sheet_id,data,created_at")
        .in("sheet_id", ids)
        .gte("created_at", inicioEm!)
        .order("created_at", { ascending: false });
      if (fimEm) q = q.lte("created_at", fimEm);
      const rows = await q;
      if (rows.error) throw rows.error;
      const byId = new Map(list.map((s) => [s.id, s]));
      return (rows.data ?? []).map((r) => {
        const s = byId.get(r.sheet_id)!;
        return {
          id: r.id,
          sheet_id: r.sheet_id,
          sheet_nome: s.nome,
          columns: (s.columns as unknown as SheetCol[]) ?? [],
          data: (r.data ?? {}) as Record<string, unknown>,
          created_at: r.created_at,
        };
      });
    },
  });

  type Evt = {
    when: string;
    tipo: "parametro" | "analise" | "observacao" | "processo_inicio" | "processo_fim" | "tabela";
    titulo: string;
    detalhe?: string;
    key: string;
  };

  const eventos: Evt[] = [];
  for (const p of parametros.data ?? []) {
    eventos.push({
      key: `par-${p.id}`,
      when: p.registrado_em,
      tipo: "parametro",
      titulo: (p.parametro as any)?.nome ?? "Parâmetro",
      detalhe: `${formatNumber(Number(p.valor))}${(p.parametro as any)?.unidade ? " " + (p.parametro as any).unidade : ""}`,
    });
  }
  for (const a of analises.data ?? []) {
    eventos.push({
      key: `anl-${a.id}`,
      when: a.registrado_em,
      tipo: "analise",
      titulo: (a.analise as any)?.nome ?? "Análise",
      detalhe: `${formatNumber(Number(a.resultado))}${(a.analise as any)?.unidade ? " " + (a.analise as any).unidade : ""}`,
    });
  }
  for (const o of observacoes.data ?? []) {
    eventos.push({
      key: `obs-${o.id}`,
      when: o.registrado_em,
      tipo: "observacao",
      titulo: "Observação",
      detalhe: o.texto,
    });
  }
  for (const e of etapas.data ?? []) {
    const ev: any = e;
    if (ev.estab_fase === "aguardando_atividade" && !ev.finalizado_em) continue;
    const nome = ev.atividade_descricao ? `${ev.processo_nome} · ${ev.atividade_descricao}` : ev.processo_nome;
    eventos.push({
      key: `etp-ini-${ev.id}`,
      when: ev.iniciado_em,
      tipo: "processo_inicio",
      titulo: `Início: ${nome}`,
    });
    if (ev.finalizado_em) {
      const partes: string[] = [];
      if (ev.duracao_seg != null) partes.push(`Duração ${formatDuracao(ev.duracao_seg)}`);
      if (ev.valor_capturado != null) {
        partes.push(`Valor ${formatNumber(Number(ev.valor_capturado))}${ev.unidade ? ` ${ev.unidade}` : ""}`);
      }
      if (ev.valor_inicio != null || ev.valor_fim != null) {
        const ini = ev.valor_inicio != null ? formatNumber(Number(ev.valor_inicio)) : "—";
        const fim = ev.valor_fim != null ? formatNumber(Number(ev.valor_fim)) : "—";
        partes.push(`Tag ${ini} → ${fim}${ev.unidade ? ` ${ev.unidade}` : ""}`);
      }
      eventos.push({
        key: `etp-fim-${ev.id}`,
        when: ev.finalizado_em,
        tipo: "processo_fim",
        titulo: `Fim: ${nome}`,
        detalhe: partes.length ? partes.join(" · ") : undefined,
      });
    }
  }
  for (const r of tabelasRows.data ?? []) {
    const partes: string[] = [];
    for (const c of r.columns) {
      const v = r.data[c.key];
      if (v === null || v === undefined || v === "") continue;
      let display: string;
      if (c.type === "boolean") display = v ? "Sim" : "Não";
      else if (c.type === "number") display = formatNumber(Number(v));
      else display = String(v);
      partes.push(`${c.label}: ${display}`);
    }
    eventos.push({
      key: `tab-${r.id}`,
      when: r.created_at,
      tipo: "tabela",
      titulo: `Registro em "${r.sheet_nome}"`,
      detalhe: partes.length ? partes.join(" · ") : undefined,
    });
  }

  eventos.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  const META: Record<Evt["tipo"], { label: string; icon: any; cls: string; dot: string }> = {
    parametro: { label: "Parâmetro", icon: Gauge, cls: "bg-blue-500/10 text-blue-700 border-blue-500/30", dot: "bg-blue-500" },
    analise: { label: "Análise", icon: FlaskConical, cls: "bg-purple-500/10 text-purple-700 border-purple-500/30", dot: "bg-purple-500" },
    observacao: { label: "Observação", icon: MessageSquare, cls: "bg-amber-500/10 text-amber-700 border-amber-500/30", dot: "bg-amber-500" },
    processo_inicio: { label: "Processo iniciado", icon: Play, cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", dot: "bg-emerald-500" },
    processo_fim: { label: "Processo finalizado", icon: Square, cls: "bg-slate-500/10 text-slate-700 border-slate-500/30", dot: "bg-slate-500" },
    tabela: { label: "Tabela", icon: FileSpreadsheet, cls: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30", dot: "bg-cyan-500" },
  };

  const loading = parametros.isLoading || analises.isLoading || observacoes.isLoading || etapas.isLoading || tabelasRows.isLoading;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Histórico e eventos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-border pl-5">
            {eventos.map((e) => {
              const m = META[e.tipo];
              const Icon = m.icon;
              return (
                <li key={e.key} className="relative">
                  <span className={`absolute -left-[26px] top-1.5 h-3 w-3 rounded-full ring-2 ring-background ${m.dot}`} />
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${m.cls}`}>
                        <Icon className="mr-1 h-3 w-3" />{m.label}
                      </Badge>
                      <span className="text-sm font-medium">{e.titulo}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{formatDate(e.when)}</span>
                    </div>
                    {e.detalhe ? (
                      <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{e.detalhe}</div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function AvancoProducaoHeader({
  ordemId, tagVel, tagTotal, qtdPlanejada,
}: { ordemId: string; tagVel: string | null; tagTotal: string | null; qtdPlanejada: number }) {
  const cfgKey = `op-indice-cfg:${ordemId}`;
  const [cfg, setCfg] = useState<{ tagConsumo: string; min: string; max: string }>(() => {
    if (typeof window === "undefined") return { tagConsumo: "", min: "", max: "" };
    try {
      const raw = window.localStorage.getItem(cfgKey);
      if (raw) return { tagConsumo: "", min: "", max: "", ...JSON.parse(raw) };
    } catch { /* noop */ }
    return { tagConsumo: "", min: "", max: "" };
  });
  useEffect(() => {
    try { window.localStorage.setItem(cfgKey, JSON.stringify(cfg)); } catch { /* noop */ }
  }, [cfg, cfgKey]);

  const tagConsumo = cfg.tagConsumo || null;
  const nomes = [tagVel, tagTotal, tagConsumo].filter(Boolean) as string[];
  const q = useQuery({
    queryKey: ["op-avanco-tags", nomes.join(",")],
    enabled: nomes.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("tags_live")
        .select("nome,valor,valor_num,unidade")
        .in("nome", nomes);
      return (data ?? []) as Array<{ nome: string; valor: string | null; valor_num: number | null; unidade: string | null }>;
    },
    refetchInterval: 3000,
  });
  const allTagsQ = useQuery({
    queryKey: ["op-avanco-all-tags"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tags_live")
        .select("nome,nome_amigavel,unidade,grupo")
        .order("grupo").order("nome").limit(1000);
      return (data ?? []) as Array<{ nome: string; nome_amigavel: string | null; unidade: string | null; grupo: string | null }>;
    },
  });
  const map = new Map((q.data ?? []).map((t) => [t.nome, t]));
  const vel = tagVel ? map.get(tagVel) : null;
  const tot = tagTotal ? map.get(tagTotal) : null;
  const cons = tagConsumo ? map.get(tagConsumo) : null;
  const totalNum = tot?.valor_num ?? null;
  const consumoNum = cons?.valor_num ?? null;
  const pct = totalNum != null && qtdPlanejada > 0
    ? Math.max(0, Math.min(100, (totalNum / qtdPlanejada) * 100))
    : null;

  const indice = (consumoNum != null && vel?.valor_num != null && vel.valor_num !== 0)
    ? consumoNum / vel.valor_num
    : null;
  const minNum = cfg.min !== "" && !isNaN(Number(cfg.min)) ? Number(cfg.min) : null;
  const maxNum = cfg.max !== "" && !isNaN(Number(cfg.max)) ? Number(cfg.max) : null;
  const foraFaixa = indice != null && (
    (minNum != null && indice < minNum) || (maxNum != null && indice > maxNum)
  );
  const dentroFaixa = indice != null && !foraFaixa && (minNum != null || maxNum != null);

  const lastAlertRef = useRef<{ state: "in" | "out" | null; at: number }>({ state: null, at: 0 });
  useEffect(() => {
    if (indice == null || (minNum == null && maxNum == null)) return;
    const state: "in" | "out" = foraFaixa ? "out" : "in";
    const now = Date.now();
    if (lastAlertRef.current.state !== state && now - lastAlertRef.current.at > 5000) {
      lastAlertRef.current = { state, at: now };
      if (state === "out") {
        toast.warning(`Índice fora da faixa: ${indice.toFixed(3)}`, {
          description: `Limites: ${minNum ?? "—"} a ${maxNum ?? "—"}`,
        });
      } else {
        toast.success(`Índice dentro da faixa: ${indice.toFixed(3)}`);
      }
    }
  }, [indice, foraFaixa, minNum, maxNum]);

  return (
    <Card className="mb-4 border-primary/30 bg-primary/5">
      <CardContent className="grid gap-4 p-4 md:grid-cols-3">
        {tagTotal ? (
          <div className="md:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Avanço da produção · <span className="font-mono">{tagTotal}</span>
              </div>
              {pct != null ? (
                <div className="font-mono text-sm font-semibold text-primary">{pct.toFixed(1)}%</div>
              ) : null}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold">
                {totalNum != null ? formatNumber(totalNum) : (tot?.valor ?? "—")}
              </span>
              <span className="text-sm text-muted-foreground">{tot?.unidade ?? ""}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                / {formatNumber(qtdPlanejada)} planejado
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
          </div>
        ) : null}
        {tagVel ? (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Velocidade · <span className="font-mono">{tagVel}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold text-success">
                {vel?.valor_num != null ? formatNumber(vel.valor_num) : (vel?.valor ?? "—")}
              </span>
              <span className="text-sm text-muted-foreground">{vel?.unidade ?? ""}</span>
            </div>
          </div>
        ) : null}

        <div className={`md:col-span-3 rounded-md border p-3 ${foraFaixa ? "border-destructive/40 bg-destructive/5" : dentroFaixa ? "border-success/40 bg-success/5" : "border-border bg-background/50"}`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tag de consumo</Label>
              <select
                className="mt-1 flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={cfg.tagConsumo}
                onChange={(e) => setCfg((c) => ({ ...c, tagConsumo: e.target.value }))}
              >
                <option value="">— selecione uma tag —</option>
                {(allTagsQ.data ?? []).map((t) => (
                  <option key={t.nome} value={t.nome}>
                    {(t.nome_amigavel?.trim() || t.nome)}{t.grupo ? ` · ${t.grupo}` : ""}{t.unidade ? ` (${t.unidade})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mín.</Label>
              <Input type="number" step="any" value={cfg.min} onChange={(e) => setCfg((c) => ({ ...c, min: e.target.value }))} />
            </div>
            <div className="w-24">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Máx.</Label>
              <Input type="number" step="any" value={cfg.max} onChange={(e) => setCfg((c) => ({ ...c, max: e.target.value }))} />
            </div>
            <div className="ml-auto min-w-[180px]">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Índice de produção {tagConsumo && tagVel ? <>· <span className="font-mono">{tagConsumo} / {tagVel}</span></> : null}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`font-mono text-2xl font-semibold ${foraFaixa ? "text-destructive" : dentroFaixa ? "text-success" : ""}`}>
                  {indice != null ? indice.toFixed(3) : "—"}
                </span>
                {cons?.unidade && vel?.unidade ? (
                  <span className="text-xs text-muted-foreground">{cons.unidade}/{vel.unidade}</span>
                ) : null}
                {foraFaixa ? <AlertTriangle className="h-4 w-4 text-destructive" /> : null}
              </div>
              {tagConsumo ? (
                <div className="text-[11px] text-muted-foreground">
                  Consumo: <span className="font-mono">{consumoNum != null ? formatNumber(consumoNum) : (cons?.valor ?? "—")} {cons?.unidade ?? ""}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TempoProducaoHeader({
  inicioEm, duracaoEstimadaMin,
}: { inicioEm: string; duracaoEstimadaMin: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const inicioMs = new Date(inicioEm).getTime();
  const decorridoMs = Math.max(0, now - inicioMs);
  const estimadoMs = duracaoEstimadaMin != null ? duracaoEstimadaMin * 60_000 : null;
  const pct = estimadoMs && estimadoMs > 0
    ? Math.max(0, Math.min(100, (decorridoMs / estimadoMs) * 100))
    : null;
  const excedido = estimadoMs != null && decorridoMs > estimadoMs;
  const restanteMs = estimadoMs != null ? estimadoMs - decorridoMs : null;

  const fmt = (ms: number) => {
    const abs = Math.abs(ms);
    const totalSec = Math.floor(abs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  return (
    <Card className={`mb-4 ${excedido ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Tempo de produção
            {estimadoMs == null ? (
              <span className="ml-2 text-[10px] text-muted-foreground">(sem tempo estimado)</span>
            ) : null}
          </div>
          {pct != null ? (
            <div className={`font-mono text-sm font-semibold ${excedido ? "text-destructive" : "text-primary"}`}>
              {pct.toFixed(1)}%{excedido ? " · excedido" : ""}
            </div>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-2xl font-semibold">{fmt(decorridoMs)}</span>
          {estimadoMs != null ? (
            <>
              <span className="text-xs text-muted-foreground">
                / {fmt(estimadoMs)} estimado
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {excedido ? "Excedido em " : "Restante "}<span className="font-mono">{fmt(restanteMs ?? 0)}</span>
              </span>
            </>
          ) : null}
        </div>
        {pct != null ? (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${excedido ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}



function TagsDoEquipamento({ tagNomes, ordemId, disabled }: { tagNomes: string[]; ordemId: string; disabled: boolean }) {
  const qc = useQueryClient();
  const [savingTag, setSavingTag] = useState<string | null>(null);

  const tags = useQuery({
    queryKey: ["equip-tags-live", tagNomes.slice().sort().join(",")],
    enabled: tagNomes.length > 0,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live")
        .select("nome,valor,valor_num,unidade,grupo,qualidade,valor_min,valor_max,atualizado_em")
        .in("nome", tagNomes);
      if (error) throw error;
      return data ?? [];
    },
  });

  const registrar = async (t: any) => {
    if (disabled) return toast.error("Ordem finalizada — não é possível registrar.");
    if (t?.valor_num == null) return toast.error("Tag sem valor numérico para registrar.");
    setSavingTag(t.nome);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      // Localizar ou criar parâmetro cadastrado com o mesmo nome da tag
      const { data: existing, error: selErr } = await supabase
        .from("parametros_cadastro")
        .select("id")
        .eq("owner_id", u.user.id)
        .eq("nome", t.nome)
        .maybeSingle();
      if (selErr) throw selErr;
      let parametroId = existing?.id;
      if (!parametroId) {
        const { data: created, error: insErr } = await supabase
          .from("parametros_cadastro")
          .insert({ owner_id: u.user.id, nome: t.nome, unidade: t.unidade ?? null, valor_min: t.valor_min ?? null, valor_max: t.valor_max ?? null })
          .select("id").single();
        if (insErr) throw insErr;
        parametroId = created.id;
      }
      const { error: regErr } = await supabase.from("parametros_registrados").insert({
        owner_id: u.user.id,
        ordem_id: ordemId,
        parametro_id: parametroId,
        valor: Number(t.valor_num),
      });
      if (regErr) throw regErr;
      toast.success(`${t.nome} registrado: ${t.valor_num}${t.unidade ? " " + t.unidade : ""}`);
      qc.invalidateQueries({ queryKey: ["params", ordemId] });
      qc.invalidateQueries({ queryKey: ["param-cat"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingTag(null);
    }
  };

  if (tagNomes.length === 0) return null;

  const byName = new Map((tags.data ?? []).map((t) => [t.nome, t]));

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Tags do equipamento
        </CardTitle>
        <span className="text-xs text-muted-foreground">Clique para registrar o valor atual</span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
          {tagNomes.map((nome) => {
            const t = byName.get(nome) as any;
            const num = t?.valor_num != null ? Number(t.valor_num) : null;
            const min = t?.valor_min != null ? Number(t.valor_min) : null;
            const max = t?.valor_max != null ? Number(t.valor_max) : null;
            const fora = num != null && ((min != null && num < min) || (max != null && num > max));
            const clickable = !!t && num != null && !disabled;
            const saving = savingTag === nome;
            return (
              <button
                type="button"
                key={nome}
                onClick={() => clickable && registrar(t)}
                disabled={!clickable || saving}
                title={clickable ? "Clique para registrar este valor no histórico" : disabled ? "Ordem finalizada" : "Sem valor numérico"}
                className={`text-left rounded-md border p-3 transition ${fora ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/20"} ${clickable ? "hover:border-primary/60 hover:bg-primary/5 cursor-pointer" : "opacity-70 cursor-not-allowed"} ${saving ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-muted-foreground" title={nome}>{nome}</span>
                  {fora ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> : null}
                </div>
                <div className="mt-1 font-mono text-lg font-semibold">
                  {t ? (t.valor ?? "—") : <span className="text-muted-foreground text-sm">sem dados</span>}
                  {t?.unidade ? <span className="ml-1 text-xs text-muted-foreground">{t.unidade}</span> : null}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{t?.grupo ?? ""}</span>
                  <span>{t?.atualizado_em ? formatDate(t.atualizado_em) : ""}</span>
                </div>
                {saving ? <div className="mt-1 text-[10px] text-primary">Registrando...</div> : null}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RegistroSection({
  disabled, label, options, valueLabel, onSubmit, rows,
}: {
  disabled: boolean;
  label: string;
  options: { id: string; nome: string; unidade?: string | null }[];
  valueLabel: string;
  onSubmit: (refId: string, valor: number) => Promise<void>;
  rows: { id: string; when: string; name?: string; unit?: string | null; value: number }[];
}) {
  const [refId, setRefId] = useState("");
  const [valor, setValor] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base">Novo registro</CardTitle></CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!refId || valor === "") return;
              setLoading(true);
              try { await onSubmit(refId, Number(valor)); setValor(""); toast.success("Registrado"); }
              catch (err) { toast.error((err as Error).message); }
              finally { setLoading(false); }
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label>{label.charAt(0).toUpperCase() + label.slice(1)}</Label>
              <select value={refId} onChange={(e) => setRefId(e.target.value)} required disabled={disabled}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— selecione —</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.nome}{o.unidade ? ` (${o.unidade})` : ""}</option>)}
              </select>
              {options.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cadastro disponível.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{valueLabel}</Label>
              <Input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value === "" ? "" : Number(e.target.value))} required disabled={disabled} />
            </div>
            <Button type="submit" disabled={disabled || loading} className="w-full">Registrar</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>{label.charAt(0).toUpperCase() + label.slice(1)}</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.when)}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="font-mono">{formatNumber(r.value)}{r.unit ? ` ${r.unit}` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ObservacoesSection({
  disabled, rows, onAdd,
}: {
  disabled: boolean;
  rows: { id: string; texto: string; registrado_em: string }[];
  onAdd: (texto: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base">Nova observação</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            setLoading(true);
            try { await onAdd(texto); setTexto(""); toast.success("Registrada"); }
            catch (err) { toast.error((err as Error).message); } finally { setLoading(false); }
          }} className="space-y-3">
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} required disabled={disabled}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <Button type="submit" disabled={disabled || loading} className="w-full">Adicionar</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma observação ainda.</p> :
            rows.map((o) => (
              <div key={o.id} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="mb-1 text-xs text-muted-foreground">{formatDate(o.registrado_em)}</div>
                <div className="whitespace-pre-wrap text-sm">{o.texto}</div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

function FinalizarDialog({
  op, tanques, onDone,
}: { op: any; tanques: { id: string; codigo: string; nome: string; produto_id?: string | null }[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [qtd, setQtd] = useState<number | "">("");
  const [obs, setObs] = useState("");
  const [tanqueId, setTanqueId] = useState("");
  const [loading, setLoading] = useState(false);
  type MatRow = {
    id: string;
    materia_prima_id: string;
    materia_prima_nome: string;
    unidade: string;
    percentual: number | null;
    quantidade_prevista: number;
    quantidade_consumida: string; // input controlled
    tanque_id: string;
    tag_consumo_nome: string | null;
    tag_valor: number | null; // captured tag value if any
  };
  const [mats, setMats] = useState<MatRow[]>([]);
  const [matsLoaded, setMatsLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQtd(""); setObs(""); setTanqueId(""); setMats([]); setMatsLoaded(false);
    (async () => {
      const { data: rows } = await supabase
        .from("ordem_materiais")
        .select("id, materia_prima_id, percentual, quantidade_prevista, tanque_id, tag_consumo_nome")
        .eq("ordem_id", op.id);
      const list = (rows ?? []) as Array<{
        id: string; materia_prima_id: string; percentual: number | null;
        quantidade_prevista: number | null; tanque_id: string | null; tag_consumo_nome: string | null;
      }>;
      if (list.length === 0) { setMatsLoaded(true); return; }
      const mpIds = Array.from(new Set(list.map((r) => r.materia_prima_id)));
      const { data: prods } = await supabase.from("produtos").select("id, nome, unidade").in("id", mpIds);
      const prodMap = new Map((prods ?? []).map((p: any) => [p.id, p]));
      const tagNames = Array.from(new Set(list.map((r) => r.tag_consumo_nome).filter(Boolean))) as string[];
      const tagMap = new Map<string, number>();
      if (tagNames.length > 0) {
        const { data: tags } = await supabase.from("tags_live").select("nome, valor_num").in("nome", tagNames);
        for (const t of (tags ?? []) as Array<{ nome: string; valor_num: number | null }>) {
          if (t.valor_num != null) tagMap.set(t.nome, Number(t.valor_num));
        }
      }
      setMats(list.map((r) => {
        const prod: any = prodMap.get(r.materia_prima_id) ?? {};
        const tagVal = r.tag_consumo_nome ? (tagMap.get(r.tag_consumo_nome) ?? null) : null;
        const prev = Number(r.quantidade_prevista ?? 0);
        const initial = tagVal != null ? tagVal : prev;
        return {
          id: r.id,
          materia_prima_id: r.materia_prima_id,
          materia_prima_nome: prod.nome ?? "—",
          unidade: prod.unidade ?? "",
          percentual: r.percentual,
          quantidade_prevista: prev,
          quantidade_consumida: String(initial),
          tanque_id: r.tanque_id ?? "",
          tag_consumo_nome: r.tag_consumo_nome,
          tag_valor: tagVal,
        };
      }));
      setMatsLoaded(true);
    })();
  }, [open, op.id]);

  const updateMat = (i: number, patch: Partial<MatRow>) =>
    setMats((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const handle = async () => {
    if (qtd === "" || Number(qtd) <= 0) return toast.error("Informe quantidade produzida");
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const fimEm = new Date().toISOString();
      const { error: e1 } = await supabase.from("ordens_producao").update({
        status: "finalizada",
        qtd_produzida: Number(qtd),
        obs_finais: obs || null,
        tanque_destino_id: tanqueId || null,
        fim_em: fimEm,
      }).eq("id", op.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("equipamentos").update({ status: "disponivel" }).eq("id", op.equipamento_id);
      if (e2) throw e2;
      // PCP: promover a próxima ordem da fila com auto_iniciar=true (se existir)
      try {
        const { data: prox } = await supabase
          .from("ordens_producao")
          .select("id")
          .eq("equipamento_id", op.equipamento_id)
          .eq("status", "programada")
          .eq("auto_iniciar", true)
          .order("fila_posicao", { ascending: true, nullsFirst: false })
          .order("inicio_previsto", { ascending: true, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (prox?.id) {
          const { data: nowData } = await supabase.rpc("server_now");
          const startIso = new Date(nowData as unknown as string).toISOString();
          await supabase.from("ordens_producao").update({ status: "em_andamento", inicio_em: startIso, fila_posicao: null }).eq("id", prox.id);
          await supabase.from("equipamentos").update({ status: "ocupado" }).eq("id", op.equipamento_id);
          toast.info("Próxima ordem da fila iniciada automaticamente");
        }
      } catch { /* ignore */ }
      if (tanqueId) {
        const { error: e3 } = await supabase.from("movimentacoes_estoque").insert({
          owner_id: u.user.id,
          produto_id: op.produto_id,
          tanque_id: tanqueId,
          tipo: "entrada",
          quantidade: Number(qtd),
          origem: `Produção OP ${op.numero}`,
          ordem_id: op.id,
          ocorrido_em: fimEm,
        });
        if (e3) throw e3;
      }

      // Baixa das matérias-primas
      for (const m of mats) {
        const qConsumo = Number(m.quantidade_consumida);
        if (!qConsumo || qConsumo <= 0) continue;
        if (m.tanque_id) {
          const { error: em } = await supabase.from("movimentacoes_estoque").insert({
            owner_id: u.user.id,
            produto_id: m.materia_prima_id,
            tanque_id: m.tanque_id,
            tipo: "saida",
            quantidade: qConsumo,
            origem: `Consumo MP — OP ${op.numero}`,
            ordem_id: op.id,
            ocorrido_em: fimEm,
          });
          if (em) throw em;
        }
        await supabase.from("ordem_materiais").update({
          quantidade_consumida: qConsumo,
          tanque_id: m.tanque_id || null,
          consumida: true,
        }).eq("id", m.id);
      }

      toast.success("Produção finalizada");
      try {
        await gerarRelatorioProducaoPdf(op.id);
        toast.success("Relatório raio-X gerado");
      } catch (pdfErr) {
        toast.error("Falha ao gerar PDF: " + (pdfErr as Error).message);
      }
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><CheckCircle2 className="mr-2 h-4 w-4" />Finalizar Produção</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Finalizar OP {op.numero}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Quantidade produzida</Label>
            <Input type="number" step="any" value={qtd} onChange={(e) => setQtd(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Tanque de destino (opcional)</Label>
            <select value={tanqueId} onChange={(e) => setTanqueId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
              <option value="">— nenhum —</option>
              {tanques.map((t) => <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Selecione um tanque para gerar entrada automática no estoque.</p>
          </div>

          {/* Baixa de matérias-primas */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="text-sm font-semibold">Consumo de matérias-primas</div>
            {!matsLoaded ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : mats.length === 0 ? (
              <p className="text-xs text-muted-foreground">Este produto não tem receita cadastrada. Nenhuma baixa de MP será realizada.</p>
            ) : (
              <div className="space-y-2">
                {mats.map((m, i) => (
                  <div key={m.id} className="grid grid-cols-12 gap-2 items-center rounded-md border border-border bg-background p-2">
                    <div className="col-span-4 text-sm">
                      <div className="font-medium">{m.materia_prima_nome}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {m.percentual != null ? `${Number(m.percentual).toFixed(2)}%` : "—"} · previsto {m.quantidade_prevista.toFixed(3)} {m.unidade}
                        {m.tag_consumo_nome ? ` · tag ${m.tag_consumo_nome}${m.tag_valor != null ? ` (${m.tag_valor})` : " (sem leitura)"}` : ""}
                      </div>
                    </div>
                    <div className="col-span-3 flex items-center gap-1">
                      <Input
                        type="number" step="any" min="0"
                        value={m.quantidade_consumida}
                        onChange={(ev) => updateMat(i, { quantidade_consumida: ev.target.value })}
                        className="h-9"
                      />
                      <span className="text-xs text-muted-foreground">{m.unidade}</span>
                    </div>
                    <select
                      value={m.tanque_id}
                      onChange={(ev) => updateMat(i, { tanque_id: ev.target.value })}
                      className="col-span-5 h-9 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="">— sem baixa em tanque —</option>
                      {tanques.map((t) => (
                        <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observações finais</Label>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handle} disabled={loading}>Confirmar finalização</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  materia_prima: { label: "Matéria-prima", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  medicao: { label: "Medição", cls: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  acao: { label: "Ação", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  tag_captura: { label: "Captação de tag", cls: "bg-purple-500/15 text-purple-700 border-purple-500/30" },
  processo: { label: "Processo", cls: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30" },
};

function formatDuracao(seg: number) {
  if (seg < 60) return `${seg}s`;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function ProcessosSection({ ordemId, equipamentoId }: { ordemId: string; equipamentoId: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const atividades = useQuery({
    queryKey: ["equipamento-atividades", equipamentoId],
    enabled: !!equipamentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipamento_atividades" as any)
        .select("id, nome, descricao, tipo, ordem, tempo_estimado_min, unidade, tag_nome, gatilhos, ativo, cor")
        .eq("equipamento_id", equipamentoId as string)
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const etapas = useQuery({
    queryKey: ["ordem-etapas", ordemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordem_etapas")
        .select("*")
        .eq("ordem_id", ordemId)
        .order("iniciado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5_000,
  });

  // Agrupa etapas por equipamento_atividade_id (mais recente primeiro).
  const etapasPorAtividade = new Map<string, any[]>();
  for (const e of (etapas.data ?? []) as any[]) {
    const key = e.equipamento_atividade_id;
    if (!key) continue;
    if (!etapasPorAtividade.has(key)) etapasPorAtividade.set(key, []);
    etapasPorAtividade.get(key)!.push(e);
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <Card>
          <CardContent className="p-3 text-xs text-muted-foreground">
            As atividades abaixo pertencem ao equipamento desta ordem e iniciam/encerram automaticamente
            conforme os gatilhos configurados em <span className="font-medium text-foreground">Cadastros &gt; Equipamentos &gt; Processos</span>.
          </CardContent>
        </Card>

        {!equipamentoId ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Esta ordem não está vinculada a um equipamento.</CardContent></Card>
        ) : atividades.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (atividades.data ?? []).length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma atividade cadastrada para este equipamento.</CardContent></Card>
        ) : (
          (atividades.data ?? []).map((a: any, idx: number) => {
            const arrTodas = etapasPorAtividade.get(a.id) ?? [];
            // Ignora linhas "sombra" de estabilização (fase amostrando, ainda sem variação detectada).
            const arr = arrTodas.filter((e) => !(e.estab_fase === "aguardando_atividade" && !e.finalizado_em));
            const aberta = arr.find((e) => !e.finalizado_em);
            const ultimaFechada = arr.find((e) => !!e.finalizado_em);
            const execucoesConcluidas = arr.filter((e) => !!e.finalizado_em).length;
            const tipoInfo = TIPO_BADGE[a.tipo] ?? { label: a.tipo, cls: "" };
            const gatilhos: Array<{ tipo: string; tag_nome: string; operador: string; valor: unknown }> = Array.isArray(a.gatilhos) ? a.gatilhos : [];
            return (
              <Card key={a.id} style={a.cor ? { borderLeft: `4px solid ${a.cor}` } : undefined}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">
                    {a.cor ? (
                      <span
                        className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
                        style={{ background: a.cor }}
                        aria-hidden
                      />
                    ) : null}
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{idx + 1}.</span>
                    {a.nome}
                    {a.tempo_estimado_min != null ? (
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        (~{a.tempo_estimado_min} min)
                      </span>
                    ) : null}
                  </CardTitle>
                  {aberta ? (() => {
                    const durSeg = Math.floor((now - new Date(aberta.iniciado_em).getTime()) / 1000);
                    const excedido = a.tempo_estimado_min != null && durSeg > a.tempo_estimado_min * 60;
                    return (
                      <Badge variant="outline" className={excedido ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/5 text-primary"}>
                        em andamento · <span className="ml-1 font-mono">{formatDuracao(durSeg)}</span>
                      </Badge>
                    );
                  })() : ultimaFechada ? (
                    <Badge variant="outline" className="text-[10px]">
                      concluída · <span className="ml-1 font-mono">{formatDuracao(ultimaFechada.duracao_seg ?? 0)}</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">aguardando gatilho</Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className={`text-[10px] ${tipoInfo.cls}`}>{tipoInfo.label}</Badge>
                    {a.tag_nome ? (
                      <Badge variant="outline" className="text-[10px]">tag: {a.tag_nome}</Badge>
                    ) : null}
                    {a.unidade ? (
                      <span className="text-[10px] text-muted-foreground">un: {a.unidade}</span>
                    ) : null}
                  </div>
                  {a.descricao ? (
                    <p className="text-xs text-muted-foreground">{a.descricao}</p>
                  ) : null}
                  {gatilhos.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {gatilhos.map((g, gi) => (
                        <Badge key={gi} variant="outline" className="text-[10px]">
                          {g.tipo}: {g.tag_nome} {String(g.operador)} {g.valor != null ? String(g.valor) : ""}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Sem gatilho cadastrado — atividade dormente até que um gatilho seja definido.
                    </p>
                  )}
                  {execucoesConcluidas > 0 || arr.length > 1 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Execuções nesta ordem: {arr.length} · concluídas: {execucoesConcluidas}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card className="lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />Histórico de etapas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(() => {
            const lista = (etapas.data ?? []).filter((e: any) => !(e.estab_fase === "aguardando_atividade" && !e.finalizado_em));
            if (lista.length === 0) {
              return <p className="text-sm text-muted-foreground">Nenhuma etapa registrada.</p>;
            }
            return lista.map((e: any) => {
            const dur = e.duracao_seg != null
              ? formatDuracao(e.duracao_seg)
              : formatDuracao(Math.floor((now - new Date(e.iniciado_em).getTime()) / 1000));
            return (
              <div key={e.id} className={`rounded-md border p-2 text-xs ${e.finalizado_em ? "border-border bg-muted/20" : "border-primary/40 bg-primary/5"}`}>
                <div className="font-medium">
                  {e.processo_nome}
                  {e.atividade_descricao ? <span className="text-muted-foreground"> · {e.atividade_descricao}</span> : null}
                </div>
                <div className="mt-1 flex items-center justify-between text-muted-foreground">
                  <span>{formatDate(e.iniciado_em)}</span>
                  <span className={`font-mono ${e.finalizado_em ? "" : "text-primary"}`}>{dur}</span>
                </div>
                {e.finalizado_em ? (
                  <div className="text-[10px] text-muted-foreground">Fim: {formatDate(e.finalizado_em)}</div>
                ) : (
                  <div className="text-[10px] text-primary">em andamento</div>
                )}
                {(() => {
                  const partes: string[] = [];
                  if (e.valor_capturado != null) {
                    partes.push(`valor: ${formatNumber(Number(e.valor_capturado))}${e.unidade ? ` ${e.unidade}` : ""}`);
                  }
                  if (e.valor_inicio != null || e.valor_fim != null) {
                    const ini = e.valor_inicio != null ? formatNumber(Number(e.valor_inicio)) : "—";
                    const fim = e.valor_fim != null ? formatNumber(Number(e.valor_fim)) : "—";
                    partes.push(`tag: ${ini} → ${fim}${e.unidade ? ` ${e.unidade}` : ""}`);
                  }
                  return partes.length ? (
                    <div className="mt-1 font-mono text-[11px] text-emerald-700">{partes.join(" · ")}</div>
                  ) : null;
                })()}
                {e.observacao ? (
                  <div className="mt-1 text-[11px] text-foreground/80">{e.observacao}</div>
                ) : null}
                {e.motivo_atraso ? (
                  <div className="mt-1 rounded bg-destructive/10 px-1.5 py-1 text-[11px] text-destructive">
                    <span className="font-semibold">Motivo do atraso:</span> {e.motivo_atraso}
                  </div>
                ) : null}
              </div>
            );
          });
          })()}
        </CardContent>
      </Card>
    </div>
  );
}


