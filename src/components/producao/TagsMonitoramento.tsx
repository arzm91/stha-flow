import { useMemo, useState, useEffect, useRef } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Brush, ReferenceLine, ReferenceArea } from "recharts";
import { LineChart as LineChartIcon, Activity, FlaskConical, MessageSquare, Workflow, Tag as TagIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODOS = [
  { k: "1h", label: "1 hora", ms: 60 * 60 * 1000 },
  { k: "6h", label: "6 horas", ms: 6 * 60 * 60 * 1000 },
  { k: "12h", label: "12 horas", ms: 12 * 60 * 60 * 1000 },
  { k: "24h", label: "24 horas", ms: 24 * 60 * 60 * 1000 },
] as const;
type PeriodoKey = (typeof PERIODOS)[number]["k"];


type EventoPonto = {
  key: string;
  tipo: "parametro" | "analise" | "observacao" | "tag_captura";
  when: number; // epoch ms
  titulo: string;
  detalhe?: string;
  cor: string;
};
type EventoFaixa = {
  key: string;
  tipo: "processo";
  inicio: number;
  fim: number; // epoch ms (now() se em curso)
  titulo: string;
  detalhe?: string;
  emCurso: boolean;
  cor: string;
};

const EVT_CORES = {
  parametro: "#3b82f6",
  analise: "#a855f7",
  observacao: "#64748b",
  tag_captura: "#14b8a6",
  processo: "#f59e0b",
} as const;

type Row = {
  id: string;
  tag_nome: string;
  valor_num: number | null;
  unidade: string | null;
  registrado_em: string;
};

const PALETTE = [
  "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#eab308", "#6366f1", "#f97316",
];

const MAX_ROWS = 5000;

export function TagsMonitoramento({
  ordemId,
  tagNomes,
  ativa,
}: {
  ordemId: string;
  tagNomes: string[];
  ativa: boolean;
}) {
  const [periodo, setPeriodo] = useState<PeriodoKey>("1h");
  const periodoMs = useMemo(
    () => PERIODOS.find((p) => p.k === periodo)!.ms,
    [periodo],
  );

  // Tick para recalcular a janela de tempo de forma "ao vivo".
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!ativa) return;
    const id = setInterval(() => setNowTick(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [ativa]);

  // Bucket de 30s para estabilizar a queryKey (evita refetch a cada render).
  const desdeBucket = Math.floor((nowTick - periodoMs) / 30_000) * 30_000;
  const desdeIso = new Date(desdeBucket).toISOString();

  const hist = useQuery({
    queryKey: ["producao-tag-historico", ordemId, periodo, desdeBucket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producao_tag_historico")
        .select("id,tag_nome,valor_num,unidade,registrado_em")
        .eq("ordem_id", ordemId)
        .gte("registrado_em", desdeIso)
        .order("registrado_em", { ascending: false })
        .limit(MAX_ROWS);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: ativa ? 10_000 : false,
    placeholderData: keepPreviousData,
  });


  // Eventos da produção (registros que serão sobrepostos ao gráfico)
  const eventosQuery = useQuery({
    queryKey: ["producao-eventos-grafico", ordemId],
    queryFn: async () => {
      const [params, anls, obs, etps] = await Promise.all([
        supabase.from("parametros_registrados")
          .select("id,valor,registrado_em,parametro:parametro_id(nome,unidade)").eq("ordem_id", ordemId),
        supabase.from("analises_registradas")
          .select("id,resultado,registrado_em,analise:analise_id(nome,unidade)").eq("ordem_id", ordemId),
        supabase.from("observacoes_producao")
          .select("id,texto,registrado_em").eq("ordem_id", ordemId),
        supabase.from("ordem_etapas")
          .select("id,tipo,processo_nome,atividade_descricao,iniciado_em,finalizado_em,observacao,motivo_atraso")
          .eq("ordem_id", ordemId),
      ]);
      return {
        parametros: params.data ?? [],
        analises: anls.data ?? [],
        observacoes: obs.data ?? [],
        etapas: etps.data ?? [],
      };
    },
    refetchInterval: ativa ? 10_000 : false,
  });

  const [evtAtivos, setEvtAtivos] = useState<Record<string, boolean>>({
    parametro: true, analise: true, observacao: true, tag_captura: true, processo: true,
  });

  // Dados em ordem cronológica (do mais antigo para o mais recente) para o gráfico.
  const dadosOrdenados = useMemo(() => {
    return [...(hist.data ?? [])].reverse();
  }, [hist.data]);

  const { tagsDisponiveis, unidades } = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const r of dadosOrdenados) {
      if (!map.has(r.tag_nome)) map.set(r.tag_nome, r.unidade);
      else if (!map.get(r.tag_nome) && r.unidade) map.set(r.tag_nome, r.unidade);
    }
    // garante todas as tags do equipamento, mesmo sem pontos ainda
    for (const n of tagNomes ?? []) if (!map.has(n)) map.set(n, null);
    return {
      tagsDisponiveis: Array.from(map.keys()),
      unidades: map,
    };
  }, [dadosOrdenados, tagNomes]);

  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  // seleciona automaticamente até 3 tags na primeira carga
  useEffect(() => {
    if (selecionadas.length === 0 && tagsDisponiveis.length > 0) {
      setSelecionadas(tagsDisponiveis.slice(0, Math.min(3, tagsDisponiveis.length)));
    }
  }, [tagsDisponiveis, selecionadas.length]);

  const corPorTag = useMemo(() => {
    const m = new Map<string, string>();
    const hash = (s: string) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    };
    tagsDisponiveis.forEach((n) => m.set(n, PALETTE[hash(n) % PALETTE.length]));
    return m;
  }, [tagsDisponiveis]);

  // Constrói dataset combinado: cada timestamp vira uma linha com colunas por tag
  const chartData = useMemo(() => {
    if (dadosOrdenados.length === 0 || selecionadas.length === 0) return [];
    const byTs = new Map<number, Record<string, number | string>>();
    for (const r of dadosOrdenados) {
      if (!selecionadas.includes(r.tag_nome)) continue;
      if (r.valor_num == null) continue;
      const t = new Date(r.registrado_em).getTime();
      if (!byTs.has(t)) byTs.set(t, { t });
      byTs.get(t)![r.tag_nome] = Number(r.valor_num);
    }
    return Array.from(byTs.values()).sort((a, b) => (a.t as number) - (b.t as number));
  }, [dadosOrdenados, selecionadas]);

  // Estatísticas por tag selecionada (considera a janela visível)
  const stats = useMemo(() => {
    const m = new Map<string, { min: number; max: number; avg: number; last: number; n: number }>();
    for (const nome of selecionadas) {
      const vals = dadosOrdenados
        .filter((r) => r.tag_nome === nome && r.valor_num != null)
        .map((r) => Number(r.valor_num));
      if (vals.length === 0) continue;
      m.set(nome, {
        n: vals.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
        avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        last: vals[vals.length - 1],
      });
    }
    return m;
  }, [dadosOrdenados, selecionadas]);

  // Constrói eventos pontuais (parâmetros, análises, observações, capturas de tag)
  // e faixas (processos com início/fim).
  const { eventosPontos, eventosFaixas } = useMemo(() => {
    const pontos: EventoPonto[] = [];
    const faixas: EventoFaixa[] = [];
    const q = eventosQuery.data;
    if (!q) return { eventosPontos: pontos, eventosFaixas: faixas };

    for (const p of q.parametros) {
      const nome = (p as any).parametro?.nome ?? "Parâmetro";
      const u = (p as any).parametro?.unidade;
      pontos.push({
        key: `par-${p.id}`, tipo: "parametro", when: new Date(p.registrado_em).getTime(),
        titulo: nome, detalhe: `${formatNumber(Number(p.valor))}${u ? " " + u : ""}`,
        cor: EVT_CORES.parametro,
      });
    }
    for (const a of q.analises) {
      const nome = (a as any).analise?.nome ?? "Análise";
      const u = (a as any).analise?.unidade;
      pontos.push({
        key: `anl-${a.id}`, tipo: "analise", when: new Date(a.registrado_em).getTime(),
        titulo: nome, detalhe: `${formatNumber(Number(a.resultado))}${u ? " " + u : ""}`,
        cor: EVT_CORES.analise,
      });
    }
    for (const o of q.observacoes) {
      pontos.push({
        key: `obs-${o.id}`, tipo: "observacao", when: new Date(o.registrado_em).getTime(),
        titulo: "Observação", detalhe: (o as any).texto ?? "", cor: EVT_CORES.observacao,
      });
    }
    for (const e of q.etapas) {
      const t = (e as any).tipo as string;
      if (t === "tag_captura") {
        pontos.push({
          key: `tag-${e.id}`, tipo: "tag_captura",
          when: new Date((e as any).iniciado_em).getTime(),
          titulo: (e as any).atividade_descricao ?? "Captura de tag",
          detalhe: (e as any).observacao ?? "",
          cor: EVT_CORES.tag_captura,
        });
      } else if ((e as any).processo_nome) {
        const ini = new Date((e as any).iniciado_em).getTime();
        const fimRaw = (e as any).finalizado_em;
        const emCurso = !fimRaw;
        const fim = fimRaw ? new Date(fimRaw).getTime() : Date.now();
        faixas.push({
          key: `proc-${e.id}`, tipo: "processo", inicio: ini, fim,
          titulo: (e as any).processo_nome,
          detalhe: (e as any).motivo_atraso || (e as any).observacao || undefined,
          emCurso, cor: EVT_CORES.processo,
        });
      }
    }
    return { eventosPontos: pontos, eventosFaixas: faixas };
  }, [eventosQuery.data]);

  // Janela de visualização: período selecionado, ancorado em "agora".
  const janelaFim = nowTick;
  const janelaInicio = nowTick - periodoMs;
  const janela = { min: janelaInicio, max: janelaFim };

  const pontosVisiveis = useMemo(() => {
    if (!janela) return [];
    return eventosPontos.filter(
      (e) => evtAtivos[e.tipo] && e.when >= janela.min && e.when <= janela.max,
    );
  }, [eventosPontos, janela, evtAtivos]);

  const faixasVisiveis = useMemo(() => {
    if (!janela) return [];
    return eventosFaixas
      .filter((e) => evtAtivos.processo && e.fim >= janela.min && e.inicio <= janela.max)
      .map((e) => ({ ...e, inicio: Math.max(e.inicio, janela.min), fim: Math.min(e.fim, janela.max) }));
  }, [eventosFaixas, janela, evtAtivos]);

  const toggle = (nome: string) => {
    setSelecionadas((cur) =>
      cur.includes(nome) ? cur.filter((n) => n !== nome) : [...cur, nome],
    );
  };

  const totalVisivel = dadosOrdenados.length;
  const periodoLabel = PERIODOS.find((p) => p.k === periodo)!.label;
  const limiteAtingido = (hist.data?.length ?? 0) >= MAX_ROWS;

  const inicioJanela = totalVisivel > 0 ? dadosOrdenados[0].registrado_em : null;
  const fimJanela = totalVisivel > 0 ? dadosOrdenados[dadosOrdenados.length - 1].registrado_em : null;

  if (!tagNomes || tagNomes.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChartIcon className="h-4 w-4 text-primary" />
          Monitoramento das tags
        </CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {ativa ? "Ao vivo (atualiza a cada 10s)" : "Histórico desta produção"}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">
            últimas {periodoLabel} · {totalVisivel} pontos
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Seletor de tags */}
        <div className="flex flex-wrap gap-2">
          {tagsDisponiveis.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              Nenhuma tag disponível para esta ordem.
            </span>
          ) : (
            tagsDisponiveis.map((nome) => {
              const ativo = selecionadas.includes(nome);
              const cor = corPorTag.get(nome)!;
              const u = unidades.get(nome);
              return (
                <Button
                  key={nome}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggle(nome)}
                  className={cn(
                    "h-7 gap-2 font-mono text-xs",
                    ativo ? "border-2" : "opacity-60 hover:opacity-100",
                  )}
                  style={ativo ? { borderColor: cor, color: cor } : undefined}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: cor }} />
                  {nome}
                  {u ? <span className="text-muted-foreground">({u})</span> : null}
                </Button>
              );
            })
          )}
        </div>

        {/* Seletor de tipos de eventos sobrepostos ao gráfico */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Eventos:</span>
          {([
            { k: "processo", label: "Processos", icon: Workflow },
            { k: "parametro", label: "Parâmetros", icon: Activity },
            { k: "analise", label: "Análises", icon: FlaskConical },
            { k: "tag_captura", label: "Capturas", icon: TagIcon },
            { k: "observacao", label: "Observações", icon: MessageSquare },
          ] as const).map(({ k, label, icon: Icon }) => {
            const on = evtAtivos[k];
            const cor = EVT_CORES[k];
            return (
              <Button
                key={k}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEvtAtivos((s) => ({ ...s, [k]: !s[k] }))}
                className={cn("h-7 gap-1.5 text-xs", on ? "border-2" : "opacity-50 hover:opacity-100")}
                style={on ? { borderColor: cor, color: cor } : undefined}
              >
                <Icon className="h-3 w-3" />
                {label}
              </Button>
            );
          })}
        </div>


        {/* Gráfico único combinado com Brush para zoom/pan */}
        <div className="h-96 w-full">
          {selecionadas.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Selecione ao menos uma tag para visualizar.
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {hist.isLoading ? "Carregando histórico..." : "Aguardando pontos do histórico..."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[janelaInicio, janelaFim]}
                  allowDataOverflow
                  scale="time"
                  tickFormatter={(t) =>
                    new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                  }
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--foreground)",
                  }}
                  labelFormatter={(t) => new Date(Number(t)).toLocaleString("pt-BR")}
                  formatter={(v: number, nome: string) => {
                    const u = unidades.get(nome);
                    return [`${formatNumber(v)}${u ? " " + u : ""}`, nome];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selecionadas.map((nome) => (
                  <Line
                    key={nome}
                    type="monotone"
                    dataKey={nome}
                    name={nome}
                    stroke={corPorTag.get(nome)}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
                {/* Faixas de processos (duração) */}
                {faixasVisiveis.map((f) => (
                  <ReferenceArea
                    key={f.key}
                    x1={f.inicio}
                    x2={f.fim}
                    fill={f.cor}
                    fillOpacity={f.emCurso ? 0.08 : 0.14}
                    stroke={f.cor}
                    strokeOpacity={0.5}
                    strokeDasharray={f.emCurso ? "4 3" : undefined}
                    ifOverflow="hidden"
                    label={{
                      value: f.titulo,
                      position: "insideTop",
                      fill: f.cor,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />
                ))}
                {/* Eventos pontuais */}
                {pontosVisiveis.map((p) => (
                  <ReferenceLine
                    key={p.key}
                    x={p.when}
                    stroke={p.cor}
                    strokeDasharray="2 2"
                    ifOverflow="hidden"
                    label={{
                      value: `● ${p.titulo}${p.detalhe ? ` ${p.detalhe}` : ""}`,
                      position: "top",
                      fill: p.cor,
                      fontSize: 9,
                      angle: -35,
                    }}
                  />
                ))}
                <Brush
                  dataKey="t"
                  height={24}
                  stroke="hsl(var(--primary))"
                  travellerWidth={8}
                  tickFormatter={(t) =>
                    new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Seletor de período de visualização */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">
              Período:
            </span>
            {PERIODOS.map((p) => {
              const on = periodo === p.k;
              return (
                <Button
                  key={p.k}
                  type="button"
                  variant={on ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriodo(p.k)}
                  className="h-7 text-xs"
                >
                  {p.label}
                </Button>
              );
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-mono text-foreground">{totalVisivel}</span> pontos
            {inicioJanela && fimJanela ? (
              <span className="ml-2 hidden sm:inline">
                ({new Date(inicioJanela).toLocaleTimeString("pt-BR")} → {new Date(fimJanela).toLocaleTimeString("pt-BR")})
              </span>
            ) : null}
            {limiteAtingido ? (
              <span className="ml-2 text-warning">· limite de {MAX_ROWS} pontos atingido</span>
            ) : null}
          </div>
        </div>


        {/* Estatísticas resumidas */}
        {stats.size > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(stats.entries()).map(([nome, s]) => {
              const cor = corPorTag.get(nome)!;
              const u = unidades.get(nome);
              return (
                <div key={nome} className="rounded-md border border-border bg-muted/20 p-2 text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate font-mono">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: cor }} />
                      {nome}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatNumber(s.last)}{u ? <span className="ml-1 text-muted-foreground">{u}</span> : null}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                    <span>n: <span className="font-mono text-foreground">{s.n}</span></span>
                    <span>mín: <span className="font-mono text-foreground">{formatNumber(s.min)}</span></span>
                    <span>méd: <span className="font-mono text-foreground">{formatNumber(s.avg)}</span></span>
                    <span>máx: <span className="font-mono text-foreground">{formatNumber(s.max)}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Linha do tempo de eventos da janela visível */}
        {janela && (faixasVisiveis.length > 0 || pontosVisiveis.length > 0) ? (
          <div className="rounded-md border border-border bg-muted/10 p-2">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Linha do tempo ({faixasVisiveis.length} processos · {pontosVisiveis.length} eventos)
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {[
                ...faixasVisiveis.map((f) => ({
                  when: f.inicio,
                  cor: f.cor,
                  label: `Processo: ${f.titulo}`,
                  extra: `${formatDuration(f.fim - f.inicio)}${f.emCurso ? " (em curso)" : ""}${f.detalhe ? " — " + f.detalhe : ""}`,
                })),
                ...pontosVisiveis.map((p) => ({
                  when: p.when,
                  cor: p.cor,
                  label: `${p.tipo === "parametro" ? "Parâmetro" : p.tipo === "analise" ? "Análise" : p.tipo === "tag_captura" ? "Captura" : "Observação"}: ${p.titulo}`,
                  extra: p.detalhe ?? "",
                })),
              ]
                .sort((a, b) => a.when - b.when)
                .map((row, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: row.cor }} />
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {new Date(row.when).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span className="font-medium">{row.label}</span>
                    {row.extra ? <span className="truncate text-muted-foreground">{row.extra}</span> : null}
                  </div>
                ))}
            </div>
          </div>
        ) : null}

      </CardContent>
    </Card>
  );
}


