import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getSource } from "@/lib/dashboard/widget-catalog";
import { formatInt, formatNumber } from "@/lib/format";
import { AlertTriangle, Wrench, FlaskConical, Factory, CheckCircle2, Clock, AlertOctagon } from "lucide-react";
import { StorageLocationCard, type StorageLocation } from "@/components/StorageLocationCard";
import { TagSparkline } from "@/components/dashboard/TagSparkline";



type WidgetRow = {
  id: string;
  titulo: string;
  tipo: string;
  fonte: string;
  config: Record<string, unknown>;
};

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function DashboardWidget({ widget }: { widget: WidgetRow }) {
  const src = getSource(widget.fonte);
  if (!src) {
    return (
      <div className="grid h-full place-items-center p-2 text-xs text-muted-foreground">
        <div className="flex flex-col items-center gap-1">
          <AlertTriangle className="h-4 w-4" />
          Fonte desconhecida
        </div>
      </div>
    );
  }
  // Sparkline overlays em widgets de tag(s)
  const tagNomes = tagNomesFromWidget(widget);
  return (
    <div className="relative h-full w-full">
      <WidgetBody widget={widget} />
      {tagNomes.length === 1 ? <TagSparkline tagNome={tagNomes[0]} /> : null}
    </div>
  );
}

function tagNomesFromWidget(w: WidgetRow): string[] {
  const cfg = w.config ?? {};
  if (w.fonte === "tag.valor" || w.fonte === "tag.gauge" || w.fonte === "tag.stats") {
    const n = String(cfg.tag_nome ?? "");
    return n ? [n] : [];
  }
  if (w.fonte === "tag.multi") {
    const arr = (cfg.tag_nomes as unknown);
    return Array.isArray(arr) ? (arr as string[]).filter(Boolean) : [];
  }
  return [];
}


function WidgetBody({ widget }: { widget: WidgetRow }) {
  const q = useQuery({
    queryKey: ["dashboard-widget", widget.fonte, widget.config],
    queryFn: () => fetchData(widget.fonte, widget.config),
    refetchInterval: 15_000,
  });

  if (q.isLoading) {
    return <div className="grid h-full place-items-center text-xs text-muted-foreground">Carregando...</div>;
  }
  if (q.error) {
    return <div className="grid h-full place-items-center text-xs text-destructive">Erro ao carregar</div>;
  }
  const data = q.data;
  if (!data) return null;

  if (data.kind === "kpi") {
    const inner = (
      <div className="flex h-full flex-col justify-center px-1">
        <div className={`font-mono text-3xl font-semibold ${data.tone ?? ""}`}>
          {data.value}
        </div>
        {data.hint ? <div className="mt-1 text-xs text-muted-foreground">{data.hint}</div> : null}
      </div>
    );
    return data.to ? <Link to={data.to} className="block h-full">{inner}</Link> : inner;
  }

  if (data.kind === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.points} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (data.kind === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.points} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="entrada" stroke="#10b981" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="saida" stroke="#ef4444" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (data.kind === "pie") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data.points} dataKey="value" nameKey="label" outerRadius="75%">
            {data.points.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (data.kind === "list") {
    if (data.items.length === 0) {
      return <div className="grid h-full place-items-center text-xs text-muted-foreground">Nada por aqui</div>;
    }
    return (
      <div className="h-full overflow-auto">
        <ul className="divide-y text-sm">
          {data.items.map((it, i) => (
            <li key={i} className="py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{it.title}</span>
                {it.value != null ? (
                  <span className="font-mono text-xs text-muted-foreground shrink-0">{it.value}</span>
                ) : null}
              </div>
              {it.subtitle ? (
                <div className="truncate text-xs text-muted-foreground">{it.subtitle}</div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (data.kind === "gauge") {
    const pct = data.max ? Math.max(0, Math.min(100, (data.value / data.max) * 100)) : 0;
    return (
      <div className="grid h-full place-items-center">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="65%" outerRadius="95%" data={[{ name: "v", value: pct, fill: "#3b82f6" }]} startAngle={210} endAngle={-30}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="-mt-16 text-center">
          <div className="font-mono text-xl font-semibold">
            {formatNumber(data.value, 2)}
            {data.unit ? <span className="ml-1 text-xs text-muted-foreground">{data.unit}</span> : null}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{data.tag}</div>
        </div>
      </div>
    );
  }


  if (data.kind === "tank") {
    return (
      <div className="h-full overflow-auto">
        <StorageLocationCard loc={data.loc} saldo={data.saldo} tag={data.tag} latestAnalise={data.latestAnalise} />
      </div>
    );
  }

  if (data.kind === "producao-prev") {
    if (!data.ordem) {
      return (
        <div className="grid h-full place-items-center text-center text-xs text-muted-foreground">
          <div>
            <Factory className="mx-auto mb-2 h-6 w-6 opacity-60" />
            <div className="font-medium text-foreground">{data.equipamento_nome ?? "Equipamento"}</div>
            <div>Sem produção ativa</div>
          </div>
        </div>
      );
    }
    const o = data.ordem;
    const totalVal = data.tag_total?.valor_num ?? null;
    const displayVal = totalVal ?? o.qtd_produzida;
    const displayUnit = totalVal != null ? (data.tag_total?.unidade ?? "") : "";
    const pct = o.qtd_planejada > 0 ? Math.min(100, (displayVal / o.qtd_planejada) * 100) : 0;
    const vel = data.tag_vel;
    return (
      <Link to="/producao/$id" params={{ id: o.id }} className="block h-full">
        <div className="flex h-full flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs uppercase tracking-wider text-muted-foreground">{data.equipamento_nome}</div>
              <div className="truncate font-semibold">{o.numero}</div>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {o.status}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">{o.produto_nome}</div>
          {vel ? (
            <div className="text-[11px] text-muted-foreground">
              Velocidade: <span className="font-mono font-semibold text-success">
                {vel.valor_num != null ? formatNumber(vel.valor_num) : "—"}{vel.unidade ? ` ${vel.unidade}` : ""}
              </span>
            </div>
          ) : null}
          {data.tag_indices && data.tag_indices.length > 0 ? (
            <div className="flex flex-wrap gap-1 text-[10px]">
              {data.tag_indices.slice(0, 4).map((t) => (
                <span key={t.nome} className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5" title={t.nome}>
                  <span className="text-muted-foreground">{t.nome_amigavel?.trim() || t.nome}:</span>
                  <span className="font-mono font-semibold">
                    {t.valor_num != null ? formatNumber(t.valor_num) : "—"}{t.unidade ? ` ${t.unidade}` : ""}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-auto">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-lg font-semibold">
                {formatNumber(displayVal)}{displayUnit ? <span className="ml-1 text-xs text-muted-foreground">{displayUnit}</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">/ {formatNumber(o.qtd_planejada)}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{pct.toFixed(0)}%</span>
              <span>iniciado {o.inicio_em ? new Date(o.inicio_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  if (data.kind === "xray-manut") {
    const x = data;
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          <MiniStat icon={<Wrench className="h-3 w-3" />} label="Abertas" value={x.abertas} />
          <MiniStat icon={<Clock className="h-3 w-3" />} label="Em andamento" value={x.em_andamento} tone="text-primary" />
          <MiniStat icon={<AlertOctagon className="h-3 w-3" />} label="Atrasadas" value={x.atrasadas} tone="text-destructive" />
          <MiniStat icon={<CheckCircle2 className="h-3 w-3" />} label="Concluídas 30d" value={x.concluidas_30d} tone="text-success" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Próximas</div>
          {x.proximas.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nada agendado</div>
          ) : (
            <ul className="divide-y text-sm">
              {x.proximas.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate"><span className="font-medium">{p.numero}</span> <span className="text-xs text-muted-foreground">· {p.prioridade}</span></span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{p.data}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (data.kind === "xray-qual") {
    const x = data;
    const total = x.conformes + x.naoconformes;
    const pct = total ? (x.conformes / total) * 100 : 100;
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat icon={<FlaskConical className="h-3 w-3" />} label="Análises 7d" value={total} />
          <MiniStat icon={<CheckCircle2 className="h-3 w-3" />} label="Conformes" value={x.conformes} tone="text-success" />
          <MiniStat icon={<AlertOctagon className="h-3 w-3" />} label="Não-conformes" value={x.naoconformes} tone={x.naoconformes ? "text-destructive" : undefined} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>Taxa de conformidade</span><span className="font-mono">{pct.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Últimas NC</div>
          {x.ultimas_nc.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nenhuma não-conformidade recente</div>
          ) : (
            <ul className="divide-y text-sm">
              {x.ultimas_nc.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate">{p.titulo}</span>
                  <span className="shrink-0 font-mono text-[11px] text-destructive">{p.valor}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (data.kind === "tag-multi") {
    if (data.items.length === 0) {
      return <div className="grid h-full place-items-center text-xs text-muted-foreground">Nenhuma tag selecionada</div>;
    }
    return (
      <div className="h-full overflow-auto pr-16">
        <ul className="divide-y text-sm">
          {data.items.map((it) => (
            <li key={it.nome} className="flex items-baseline justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate text-xs text-muted-foreground" title={it.nome}>
                {it.nome_amigavel?.trim() || it.nome}
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold">
                {it.valor_num != null ? formatNumber(it.valor_num, 2) : (it.valor ?? "—")}
                {it.unidade ? <span className="ml-1 text-[10px] text-muted-foreground">{it.unidade}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (data.kind === "tag-stats") {
    return (
      <div className="flex h-full flex-col gap-2 pr-16">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate" title={data.tag}>{data.tag}</div>
        <div className="font-mono text-2xl font-semibold">
          {data.atual != null ? formatNumber(data.atual, 2) : "—"}
          {data.unidade ? <span className="ml-1 text-xs text-muted-foreground">{data.unidade}</span> : null}
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 text-xs">
          <MiniStat label="Mín (24h)" value={data.min != null ? formatNumber(data.min, 2) : "—"} />
          <MiniStat label="Média" value={data.avg != null ? formatNumber(data.avg, 2) : "—"} />
          <MiniStat label="Máx" value={data.max != null ? formatNumber(data.max, 2) : "—"} tone="text-primary" />
        </div>
      </div>
    );
  }

  return null;
}


function MiniStat({ icon, label, value, tone }: { icon?: React.ReactNode; label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-md border bg-card/50 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className={`mt-0.5 font-mono text-lg font-semibold ${tone ?? ""}`}>{typeof value === "number" ? formatInt(value) : value}</div>
    </div>
  );
}

// ============ Data fetchers ============

type WidgetData =
  | { kind: "kpi"; value: string; hint?: string; tone?: string; to?: string }
  | { kind: "bar"; points: { label: string; value: number }[] }
  | { kind: "line"; points: { label: string; entrada: number; saida: number }[] }
  | { kind: "pie"; points: { label: string; value: number }[] }
  | { kind: "list"; items: { title: string; subtitle?: string; value?: string }[] }
  | { kind: "gauge"; value: number; max: number; unit?: string; tag: string }
  | { kind: "tank"; loc: StorageLocation; saldo: number; tag: { nome: string; valor_num: number | null; valor: string | null; unidade: string | null } | null; latestAnalise: import("@/components/StorageLocationCard").LatestAnalise | null }
  | { kind: "producao-prev"; equipamento_nome: string; ordem: { id: string; numero: string; status: string; produto_nome: string; qtd_planejada: number; qtd_produzida: number; inicio_em: string | null } | null; tag_total?: { nome: string; valor_num: number | null; unidade: string | null } | null; tag_vel?: { nome: string; valor_num: number | null; unidade: string | null } | null; tag_indices?: Array<{ nome: string; nome_amigavel: string | null; valor_num: number | null; unidade: string | null }> }
  | { kind: "xray-manut"; abertas: number; em_andamento: number; atrasadas: number; concluidas_30d: number; proximas: { numero: string; prioridade: string; data: string }[] }
  | { kind: "xray-qual"; conformes: number; naoconformes: number; ultimas_nc: { titulo: string; valor: string }[] }
  | { kind: "tag-multi"; items: Array<{ nome: string; nome_amigavel: string | null; valor_num: number | null; valor: string | null; unidade: string | null }> }
  | { kind: "tag-stats"; tag: string; unidade: string | null; atual: number | null; min: number | null; max: number | null; avg: number | null };


async function fetchData(fonte: string, config: Record<string, unknown>): Promise<WidgetData> {
  switch (fonte) {
    // ---- Produção ----
    case "kpi.producao.em_andamento": {
      const { count } = await supabase.from("ordens_producao").select("*", { count: "exact", head: true }).eq("status", "em_andamento");
      return { kind: "kpi", value: formatInt(count ?? 0), tone: "text-primary", to: "/producao" };
    }
    case "kpi.producao.finalizadas_hoje": {
      const { count } = await supabase.from("ordens_producao").select("*", { count: "exact", head: true })
        .eq("status", "finalizada").gte("fim_em", startOfToday());
      return { kind: "kpi", value: formatInt(count ?? 0), tone: "text-success", to: "/relatorios/producao" };
    }
    case "kpi.producao.qtd_hoje": {
      const { data } = await supabase.from("ordens_producao").select("qtd_produzida").gte("fim_em", startOfToday());
      const total = (data ?? []).reduce((s, r) => s + Number(r.qtd_produzida ?? 0), 0);
      return { kind: "kpi", value: formatNumber(total), to: "/relatorios/producao" };
    }
    case "kpi.equipamentos.operando": {
      const { count } = await supabase.from("equipamentos").select("*", { count: "exact", head: true }).eq("status", "ocupado");
      return { kind: "kpi", value: formatInt(count ?? 0), to: "/producao" };
    }
    case "kpi.equipamentos.parados": {
      const { count } = await supabase.from("equipamentos").select("*", { count: "exact", head: true }).eq("status", "parado");
      return { kind: "kpi", value: formatInt(count ?? 0), tone: "text-warning", to: "/cadastros/equipamentos" };
    }
    case "chart.producao.7dias": {
      const { data } = await supabase.from("ordens_producao").select("fim_em,qtd_produzida")
        .gte("fim_em", daysAgo(6).toISOString()).not("fim_em", "is", null);
      const buckets = buildDayBuckets(7);
      for (const r of data ?? []) {
        const k = bucketKey(new Date(r.fim_em!));
        if (k in buckets) buckets[k] += Number(r.qtd_produzida ?? 0);
      }
      return { kind: "bar", points: Object.entries(buckets).map(([label, value]) => ({ label, value })) };
    }
    case "list.producao.abertas": {
      const { data } = await supabase.from("ordens_producao").select("id,numero,produto_id,status,inicio_em")
        .in("status", ["em_andamento", "pausada"]).order("inicio_em", { ascending: false }).limit(10);
      return {
        kind: "list",
        items: (data ?? []).map((r) => ({
          title: r.numero ?? r.id.slice(0, 8),
          subtitle: r.status,
          value: r.inicio_em ? new Date(r.inicio_em).toLocaleDateString("pt-BR") : "",
        })),
      };
    }

    // ---- Estoque ----
    case "kpi.estoque.saldo": {
      const [{ data: movs }, { data: ajustes }] = await Promise.all([
        supabase.from("movimentacoes_estoque").select("tanque_id,tipo,quantidade,ocorrido_em"),
        supabase.from("tanque_ajustes_saldo").select("tanque_id,saldo,ajustado_em").order("ajustado_em", { ascending: false }),
      ]);
      const ultimoAjuste = new Map<string, { saldo: number; ts: number }>();
      for (const a of ajustes ?? []) {
        if (!a.tanque_id || ultimoAjuste.has(a.tanque_id)) continue;
        ultimoAjuste.set(a.tanque_id, { saldo: Number(a.saldo), ts: new Date(a.ajustado_em).getTime() });
      }
      const saldos = new Map<string, number>();
      for (const [tid, aj] of ultimoAjuste) saldos.set(tid, aj.saldo);
      let semTanque = 0;
      for (const m of movs ?? []) {
        const q = (m.tipo === "entrada" ? 1 : -1) * Number(m.quantidade);
        if (!m.tanque_id) { semTanque += q; continue; }
        const aj = ultimoAjuste.get(m.tanque_id);
        if (aj && new Date(m.ocorrido_em).getTime() <= aj.ts) continue;
        saldos.set(m.tanque_id, (saldos.get(m.tanque_id) ?? 0) + q);
      }
      const total = Array.from(saldos.values()).reduce((s, v) => s + v, 0) + semTanque;
      return { kind: "kpi", value: formatNumber(total), tone: "text-primary", to: "/estoque" };
    }
    case "kpi.estoque.entradas_hoje": {
      const { data } = await supabase.from("movimentacoes_estoque").select("quantidade")
        .eq("tipo", "entrada").gte("ocorrido_em", startOfToday());
      const total = (data ?? []).reduce((s, r) => s + Number(r.quantidade), 0);
      return { kind: "kpi", value: formatNumber(total), tone: "text-success", to: "/relatorios/estoque" };
    }
    case "kpi.estoque.saidas_hoje": {
      const { data } = await supabase.from("movimentacoes_estoque").select("quantidade")
        .eq("tipo", "saida").gte("ocorrido_em", startOfToday());
      const total = (data ?? []).reduce((s, r) => s + Number(r.quantidade), 0);
      return { kind: "kpi", value: formatNumber(total), to: "/relatorios/estoque" };
    }
    case "kpi.estoque.movs_hoje": {
      const { count } = await supabase.from("movimentacoes_estoque").select("*", { count: "exact", head: true })
        .gte("ocorrido_em", startOfToday());
      return { kind: "kpi", value: formatInt(count ?? 0), to: "/estoque/movimentacao" };
    }
    case "chart.estoque.7dias": {
      const { data } = await supabase.from("movimentacoes_estoque").select("ocorrido_em,tipo,quantidade")
        .gte("ocorrido_em", daysAgo(6).toISOString());
      const bIn = buildDayBuckets(7);
      const bOut = buildDayBuckets(7);
      for (const r of data ?? []) {
        const k = bucketKey(new Date(r.ocorrido_em));
        if (r.tipo === "entrada") bIn[k] += Number(r.quantidade);
        else bOut[k] += Number(r.quantidade);
      }
      const labels = Object.keys(bIn);
      return { kind: "line", points: labels.map((l) => ({ label: l, entrada: bIn[l], saida: bOut[l] })) };
    }
    case "list.estoque.recentes": {
      const { data } = await supabase.from("movimentacoes_estoque").select("tipo,quantidade,ocorrido_em,origem,destino")
        .order("ocorrido_em", { ascending: false }).limit(10);
      return {
        kind: "list",
        items: (data ?? []).map((r) => ({
          title: `${r.tipo === "entrada" ? "↑" : "↓"} ${formatNumber(Number(r.quantidade))}`,
          subtitle: [r.origem, r.destino].filter(Boolean).join(" → "),
          value: new Date(r.ocorrido_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        })),
      };
    }

    // ---- Alertas ----
    case "kpi.alertas.ativos": {
      const { count } = await supabase.from("alertas").select("*", { count: "exact", head: true }).eq("ativo", true);
      return { kind: "kpi", value: formatInt(count ?? 0), to: "/alertas" };
    }
    case "kpi.alertas.disparos_24h": {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase.from("alertas_disparos").select("*", { count: "exact", head: true }).gte("created_at", since);
      return { kind: "kpi", value: formatInt(count ?? 0), tone: "text-warning", to: "/alertas" };
    }
    case "kpi.alertas.criticos_24h": {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase.from("alertas_disparos").select("*", { count: "exact", head: true })
        .gte("created_at", since).eq("severidade", "critico");
      return { kind: "kpi", value: formatInt(count ?? 0), tone: "text-destructive", to: "/alertas" };
    }
    case "chart.alertas.severidade": {
      const since = daysAgo(6).toISOString();
      const { data } = await supabase.from("alertas_disparos").select("severidade").gte("created_at", since);
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        const s = r.severidade ?? "info";
        map[s] = (map[s] ?? 0) + 1;
      }
      return { kind: "pie", points: Object.entries(map).map(([label, value]) => ({ label, value })) };
    }
    case "list.alertas.recentes": {
      const { data } = await supabase.from("alertas_disparos").select("alerta_nome,mensagem,severidade,created_at")
        .order("created_at", { ascending: false }).limit(10);
      return {
        kind: "list",
        items: (data ?? []).map((r) => ({
          title: r.alerta_nome ?? "Alerta",
          subtitle: r.mensagem ?? "",
          value: new Date(r.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        })),
      };
    }

    // ---- Manutenção ----
    case "kpi.manutencao.pendentes": {
      const { count } = await supabase.from("ordens_manutencao").select("*", { count: "exact", head: true })
        .in("status", ["aberta", "em_andamento"]);
      return { kind: "kpi", value: formatInt(count ?? 0), to: "/manutencao" };
    }
    case "kpi.manutencao.atrasadas": {
      const { count } = await supabase.from("ordens_manutencao").select("*", { count: "exact", head: true })
        .lt("agendada_para", new Date().toISOString()).in("status", ["aberta", "em_andamento"]);
      return { kind: "kpi", value: formatInt(count ?? 0), tone: "text-destructive", to: "/manutencao" };
    }
    case "list.manutencao.proximas": {
      const { data } = await supabase.from("ordens_manutencao").select("numero,agendada_para,status,prioridade,descricao_problema")
        .in("status", ["aberta", "em_andamento"]).order("agendada_para", { ascending: true }).limit(10);
      return {
        kind: "list",
        items: (data ?? []).map((r) => ({
          title: r.numero ?? r.descricao_problema ?? "OS",
          subtitle: r.prioridade ?? "",
          value: r.agendada_para ? new Date(r.agendada_para).toLocaleDateString("pt-BR") : "",
        })),
      };
    }

    // ---- Turnos ----
    case "kpi.turnos.eventos_hoje": {
      const { count } = await supabase.from("relatorio_turno_eventos").select("*", { count: "exact", head: true })
        .gte("ocorrido_em", startOfToday());
      return { kind: "kpi", value: formatInt(count ?? 0), to: "/turnos" };
    }

    // ---- Qualidade ----
    case "kpi.qualidade.analises_hoje": {
      const { count } = await supabase.from("analises_registradas").select("*", { count: "exact", head: true })
        .gte("created_at", startOfToday());
      return { kind: "kpi", value: formatInt(count ?? 0), to: "/relatorios/qualidade" };
    }
    case "kpi.qualidade.naoconformes_hoje": {
      const [{ data: regs }, { data: refs }] = await Promise.all([
        supabase.from("analises_registradas").select("resultado,analise_id").gte("created_at", startOfToday()),
        supabase.from("analises_cadastro").select("id,valor_min,valor_max"),
      ]);
      const refMap = new Map((refs ?? []).map((r) => [r.id, r]));
      const nc = (regs ?? []).filter((a) => {
        const ref = refMap.get(a.analise_id);
        if (!ref) return false;
        const v = Number(a.resultado);
        if (ref.valor_min != null && v < Number(ref.valor_min)) return true;
        if (ref.valor_max != null && v > Number(ref.valor_max)) return true;
        return false;
      }).length;
      return { kind: "kpi", value: formatInt(nc), tone: nc ? "text-destructive" : undefined, to: "/relatorios/qualidade" };
    }

    // ---- Tags ----
    case "tag.valor": {
      const nome = String(config.tag_nome ?? "");
      if (!nome) return { kind: "kpi", value: "—", hint: "Configure a tag" };
      const { data } = await supabase.from("tags_live").select("valor,valor_num,unidade,atualizado_em").eq("nome", nome).maybeSingle();
      if (!data) return { kind: "kpi", value: "—", hint: nome };
      const v = data.valor_num != null ? formatNumber(Number(data.valor_num), 2) : (data.valor ?? "—");
      return {
        kind: "kpi",
        value: `${v}${data.unidade ? " " + data.unidade : ""}`,
        hint: `${nome} · ${new Date(data.atualizado_em).toLocaleTimeString("pt-BR")}`,
        to: "/tags",
      };
    }
    case "tag.gauge": {
      const nome = String(config.tag_nome ?? "");
      const min = Number(config.min ?? 0);
      const max = Number(config.max ?? 100);
      if (!nome) return { kind: "kpi", value: "—", hint: "Configure a tag" };
      const { data } = await supabase.from("tags_live").select("valor_num,unidade").eq("nome", nome).maybeSingle();
      const v = data?.valor_num != null ? Number(data.valor_num) : 0;
      return { kind: "gauge", value: v - min, max: max - min, unit: data?.unidade ?? "", tag: nome };
    }

    case "tag.multi":
    case "tag.tiles": {
      const nomes = Array.isArray(config.tag_nomes) ? (config.tag_nomes as string[]).filter(Boolean) : [];
      const kind = fonte === "tag.tiles" ? "tag-tiles" : "tag-multi";
      if (nomes.length === 0) return { kind, items: [] } as WidgetData;
      const { data } = await supabase
        .from("tags_live")
        .select("nome,nome_amigavel,valor,valor_num,unidade")
        .in("nome", nomes);
      const map = new Map((data ?? []).map((r) => [r.nome, r]));
      const items = nomes.map((n) => {
        const r = map.get(n);
        return {
          nome: n,
          nome_amigavel: (r?.nome_amigavel ?? null) as string | null,
          valor_num: r?.valor_num != null ? Number(r.valor_num) : null,
          valor: (r?.valor ?? null) as string | null,
          unidade: (r?.unidade ?? null) as string | null,
        };
      });
      return { kind, items } as WidgetData;
    }

    case "tag.stats": {
      const nome = String(config.tag_nome ?? "");
      if (!nome) return { kind: "tag-stats", tag: "—", unidade: null, atual: null, min: null, max: null, avg: null };
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const [{ data: live }, { data: hist }] = await Promise.all([
        supabase.from("tags_live").select("valor_num,unidade").eq("nome", nome).maybeSingle(),
        supabase.from("producao_tag_historico")
          .select("valor_num")
          .eq("tag_nome", nome)
          .gte("registrado_em", since)
          .not("valor_num", "is", null)
          .limit(1000),
      ]);
      const vals = (hist ?? []).map((r) => Number(r.valor_num)).filter((v) => Number.isFinite(v));
      const min = vals.length ? Math.min(...vals) : null;
      const max = vals.length ? Math.max(...vals) : null;
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      return {
        kind: "tag-stats",
        tag: nome,
        unidade: (live?.unidade ?? null) as string | null,
        atual: live?.valor_num != null ? Number(live.valor_num) : null,
        min, max, avg,
      };
    }




    // ---- Tanque ----
    case "tank.preview": {
      const tankId = String(config.tank_id ?? "");
      if (!tankId) return { kind: "kpi", value: "—", hint: "Configure o tanque" };
      const { data: t } = await supabase.from("tanques")
        .select("id,codigo,nome,tipo,capacidade,unidade,tag_nivel_nome,tag_nivel_modo,cor")
        .eq("id", tankId).maybeSingle();
      if (!t) return { kind: "kpi", value: "—", hint: "Tanque não encontrado" };
      const [{ data: movs }, { data: ajustes }, tagRes, analiseRes] = await Promise.all([
        supabase.from("movimentacoes_estoque").select("tipo,quantidade,ocorrido_em").eq("tanque_id", tankId),
        supabase.from("tanque_ajustes_saldo").select("saldo,ajustado_em").eq("tanque_id", tankId).order("ajustado_em", { ascending: false }).limit(1),
        t.tag_nivel_nome
          ? supabase.from("tags_live").select("nome,valor,valor_num,unidade").eq("nome", t.tag_nivel_nome).maybeSingle()
          : Promise.resolve({ data: null } as { data: null }),
        supabase.from("tanque_analises")
          .select("resultado,registrado_em, analise:analise_id(nome,unidade,valor_min,valor_max)")
          .eq("tanque_id", tankId)
          .order("registrado_em", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const aj = (ajustes ?? [])[0];
      const ajTs = aj ? new Date(aj.ajustado_em).getTime() : null;
      let saldo = aj ? Number(aj.saldo) : 0;
      for (const m of movs ?? []) {
        if (ajTs != null && new Date(m.ocorrido_em).getTime() <= ajTs) continue;
        saldo += (m.tipo === "entrada" ? 1 : -1) * Number(m.quantidade);
      }
      const an = analiseRes.data as { resultado: number; registrado_em: string; analise: { nome: string | null; unidade: string | null; valor_min: number | null; valor_max: number | null } | null } | null;
      const latestAnalise = an
        ? {
            nome: an.analise?.nome ?? null,
            resultado: Number(an.resultado),
            unidade: an.analise?.unidade ?? null,
            valor_min: an.analise?.valor_min != null ? Number(an.analise.valor_min) : null,
            valor_max: an.analise?.valor_max != null ? Number(an.analise.valor_max) : null,
            registrado_em: an.registrado_em,
          }
        : null;
      return { kind: "tank", loc: t as StorageLocation, saldo, tag: (tagRes.data as { nome: string; valor: string | null; valor_num: number | null; unidade: string | null } | null), latestAnalise };
    }

    // ---- Prévia de produção por equipamento ----
    case "producao.equipamento": {
      const equipId = String(config.equipamento_id ?? "");
      if (!equipId) return { kind: "kpi", value: "—", hint: "Configure o equipamento" };
      const [{ data: eq }, { data: o }] = await Promise.all([
        supabase.from("equipamentos").select("nome,tag_producao_total,tag_velocidade_producao,tag_indices").eq("id", equipId).maybeSingle(),
        supabase.from("ordens_producao")
          .select("id,numero,status,qtd_planejada,qtd_produzida,inicio_em,produto_id")
          .eq("equipamento_id", equipId).in("status", ["em_andamento", "pausada"])
          .order("inicio_em", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const equipamento_nome = eq?.nome ?? "Equipamento";
      const tagIndices = ((eq?.tag_indices ?? []) as string[]);
      if (!o) return { kind: "producao-prev", equipamento_nome, ordem: null, tag_indices: [] };
      const nomes = Array.from(new Set([eq?.tag_producao_total, eq?.tag_velocidade_producao, ...tagIndices].filter(Boolean) as string[]));
      const [{ data: prod }, tagsRes] = await Promise.all([
        o.produto_id
          ? supabase.from("produtos").select("nome").eq("id", o.produto_id).maybeSingle()
          : Promise.resolve({ data: null as { nome: string } | null }),
        nomes.length
          ? supabase.from("tags_live").select("nome,nome_amigavel,valor_num,unidade").in("nome", nomes)
          : Promise.resolve({ data: [] as Array<{ nome: string; nome_amigavel: string | null; valor_num: number | null; unidade: string | null }> }),
      ]);
      const tMap = new Map(((tagsRes.data ?? []) as Array<{ nome: string; nome_amigavel: string | null; valor_num: number | null; unidade: string | null }>).map((t) => [t.nome, t]));
      return {
        kind: "producao-prev",
        equipamento_nome,
        ordem: {
          id: o.id, numero: o.numero, status: o.status,
          produto_nome: prod?.nome ?? "—",
          qtd_planejada: Number(o.qtd_planejada ?? 0),
          qtd_produzida: Number(o.qtd_produzida ?? 0),
          inicio_em: o.inicio_em,
        },
        tag_total: eq?.tag_producao_total ? (tMap.get(eq.tag_producao_total) ?? null) : null,
        tag_vel: eq?.tag_velocidade_producao ? (tMap.get(eq.tag_velocidade_producao) ?? null) : null,
        tag_indices: tagIndices.map((n) => ({ nome: n, ...(tMap.get(n) ?? { nome_amigavel: null, valor_num: null, unidade: null }) })),
      };
    }

    // ---- Raio-X manutenção ----
    case "xray.manutencao": {
      const nowIso = new Date().toISOString();
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const [a, b, c, d, prox] = await Promise.all([
        supabase.from("ordens_manutencao").select("*", { count: "exact", head: true }).eq("status", "aberta"),
        supabase.from("ordens_manutencao").select("*", { count: "exact", head: true }).eq("status", "em_andamento"),
        supabase.from("ordens_manutencao").select("*", { count: "exact", head: true })
          .lt("agendada_para", nowIso).in("status", ["aberta", "em_andamento"]),
        supabase.from("ordens_manutencao").select("*", { count: "exact", head: true })
          .eq("status", "concluida").gte("updated_at", since30),
        supabase.from("ordens_manutencao").select("numero,prioridade,agendada_para")
          .in("status", ["aberta", "em_andamento"]).order("agendada_para", { ascending: true }).limit(5),
      ]);
      return {
        kind: "xray-manut",
        abertas: a.count ?? 0, em_andamento: b.count ?? 0, atrasadas: c.count ?? 0, concluidas_30d: d.count ?? 0,
        proximas: (prox.data ?? []).map((r) => ({
          numero: r.numero ?? "OS",
          prioridade: r.prioridade ?? "—",
          data: r.agendada_para ? new Date(r.agendada_para).toLocaleDateString("pt-BR") : "—",
        })),
      };
    }

    // ---- Raio-X qualidade ----
    case "xray.qualidade": {
      const since = daysAgo(6).toISOString();
      const [{ data: regs }, { data: refs }] = await Promise.all([
        supabase.from("analises_registradas").select("id,resultado,analise_id,created_at").gte("created_at", since).order("created_at", { ascending: false }),
        supabase.from("analises_cadastro").select("id,nome,valor_min,valor_max,unidade"),
      ]);
      const refMap = new Map((refs ?? []).map((r) => [r.id, r]));
      let conformes = 0, naoconformes = 0;
      const ultimas_nc: { titulo: string; valor: string }[] = [];
      for (const a of regs ?? []) {
        const ref = refMap.get(a.analise_id);
        const v = Number(a.resultado);
        const out = ref && ((ref.valor_min != null && v < Number(ref.valor_min)) || (ref.valor_max != null && v > Number(ref.valor_max)));
        if (out) {
          naoconformes++;
          if (ultimas_nc.length < 5) ultimas_nc.push({ titulo: ref?.nome ?? "Análise", valor: `${formatNumber(v, 2)}${ref?.unidade ? " " + ref.unidade : ""}` });
        } else conformes++;
      }
      return { kind: "xray-qual", conformes, naoconformes, ultimas_nc };
    }

    // ---- Tabela personalizada ----
    case "list.tabela": {
      const sheetId = String(config.sheet_id ?? "");
      if (!sheetId) return { kind: "list", items: [] };
      const [{ data: sheet }, { data: rows }] = await Promise.all([
        supabase.from("custom_sheets").select("nome,columns").eq("id", sheetId).maybeSingle(),
        supabase.from("custom_sheet_rows").select("data,created_at").eq("sheet_id", sheetId).order("created_at", { ascending: false }).limit(10),
      ]);
      const cols = (sheet?.columns ?? []) as Array<{ key: string; label?: string }>;
      const titleKey = cols[0]?.key;
      const subKey = cols[1]?.key;
      const valKey = cols[2]?.key;
      return {
        kind: "list",
        items: (rows ?? []).map((r) => {
          const d = (r.data ?? {}) as Record<string, unknown>;
          return {
            title: titleKey ? String(d[titleKey] ?? "—") : new Date(r.created_at).toLocaleString("pt-BR"),
            subtitle: subKey ? String(d[subKey] ?? "") : undefined,
            value: valKey ? String(d[valKey] ?? "") : undefined,
          };
        }),
      };
    }

    default:
      return { kind: "kpi", value: "—", hint: "Não implementado" };
  }
}

function buildDayBuckets(days: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out[d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })] = 0;
  }
  return out;
}
function bucketKey(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
