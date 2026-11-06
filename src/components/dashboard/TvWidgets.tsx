// Cards pensados para TV: poucos números, grandes, com cor de status.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardFilters, DashboardPeriod } from "@/lib/dashboard/period";
import { calcularLimites, calcularSet, calcularStatus } from "@/lib/parametros/status";
import { ArrowDown, ArrowUp, CheckCircle2, AlertTriangle, Minus } from "lucide-react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type W = { fonte: string; config: Record<string, unknown> };
const nf = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function TvWidget({ widget, period, filters }: { widget: W; period: DashboardPeriod; filters: DashboardFilters }) {
  switch (widget.fonte) {
    case "tv.numero": return <TvNumero widget={widget} />;
    case "tv.parametros": return <TvParametros />;
    case "tv.meta": return <TvMeta widget={widget} period={period} filters={filters} />;
    case "tv.paradas": return <TvParadas period={period} filters={filters} />;
    case "tv.alertas": return <TvAlertas />;
    case "tv.tendencia": return <TvTendencia widget={widget} />;
    default: return null;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full w-full flex-col justify-center gap-1 p-3 @container">{children}</div>;
}

function TvNumero({ widget }: { widget: W }) {
  const tag = String(widget.config.tag_nome ?? "");
  const min = num(widget.config.min), max = num(widget.config.max);
  const q = useQuery({
    queryKey: ["tv-numero", tag],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("tags_live").select("valor_num,valor_num_prev,unidade,atualizado_em").eq("nome", tag).maybeSingle();
      return data;
    },
  });
  const v = q.data?.valor_num ?? null;
  const prev = q.data?.valor_num_prev ?? null;
  const tone = v === null ? "text-muted-foreground" : (min !== null && v < min) || (max !== null && v > max) ? "text-destructive" : (min !== null || max !== null) ? "text-success" : "text-foreground";
  const Trend = v === null || prev === null || v === prev ? Minus : v > prev ? ArrowUp : ArrowDown;
  return (
    <Shell>
      <div className="flex items-baseline justify-center gap-2">
        <span className={`font-bold tabular-nums leading-none text-[clamp(2rem,9cqw,6rem)] ${tone}`}>{nf(v, 2)}</span>
        <span className="text-xl text-muted-foreground">{q.data?.unidade ?? ""}</span>
        <Trend className="h-7 w-7 text-muted-foreground" />
      </div>
      {(min !== null || max !== null) && (
        <div className="text-center text-sm text-muted-foreground">faixa {nf(min, 2)} – {nf(max, 2)}</div>
      )}
    </Shell>
  );
}

function TvParametros() {
  const q = useQuery({
    queryKey: ["tv-parametros"],
    refetchInterval: 5000,
    queryFn: async () => {
      const [{ data: ps }, { data: tags }] = await Promise.all([
        supabase.from("parametros_unidade").select("*").eq("ativo", true).order("ordem"),
        supabase.from("tags_live").select("nome,valor_num").limit(5000),
      ]);
      const m = new Map((tags ?? []).map((t) => [t.nome, t.valor_num as number | null]));
      const tv = (n: string) => m.get(n) ?? null;
      return (ps ?? []).map((p) => {
        const set = p.set_modo === "formula" && p.set_formula ? calcularSet(p.set_formula, (p.variaveis ?? {}) as Record<string, string | number>, tv) : p.set_valor;
        const lim = calcularLimites(set, p.margem_modo, p.margem_min, p.margem_max);
        const valor = p.tag_leitura ? tv(p.tag_leitura) : null;
        return { id: p.id, nome: p.nome, unidade: p.unidade, valor, status: calcularStatus(valor, set, lim, p.tolerancia_ideal) };
      });
    },
  });
  const rows = q.data ?? [];
  const fora = rows.filter((r) => r.status === "acima" || r.status === "abaixo");
  if (rows.length === 0) return <Shell><div className="text-center text-muted-foreground">Nenhum parâmetro cadastrado</div></Shell>;
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className={`flex items-center gap-2 text-xl font-bold ${fora.length ? "text-destructive" : "text-success"}`}>
        {fora.length ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
        {fora.length ? `${fora.length} fora da margem` : `Todos os ${rows.length} na margem`}
      </div>
      <div className="flex-1 space-y-1 overflow-hidden">
        {fora.slice(0, 6).map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-md bg-destructive/15 px-3 py-1.5 text-lg font-semibold">
            <span className="truncate">{r.nome}</span>
            <span className="flex items-center gap-1 tabular-nums text-destructive">
              {r.status === "acima" ? <ArrowUp className="h-5 w-5" /> : <ArrowDown className="h-5 w-5" />}
              {nf(r.valor, 2)} {r.unidade}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function useProducao(period: DashboardPeriod, filters: DashboardFilters) {
  return useQuery({
    queryKey: ["tv-producao", period.start, period.end, filters.equipamentoId, filters.produtoId],
    refetchInterval: 30000,
    queryFn: async () => {
      let q = supabase.from("ordens_producao").select("qtd_produzida,status,fim_em,inicio_em")
        .neq("status", "cancelada").gte("inicio_em", period.start).lte("inicio_em", period.end).limit(2000);
      if (filters.equipamentoId) q = q.eq("equipamento_id", filters.equipamentoId);
      if (filters.produtoId) q = q.eq("produto_id", filters.produtoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + (Number(r.qtd_produzida) || 0), 0);
    },
  });
}

function TvMeta({ widget, period, filters }: { widget: W; period: DashboardPeriod; filters: DashboardFilters }) {
  const meta = num(widget.config.meta) ?? 0;
  const q = useProducao(period, filters);
  const real = q.data ?? 0;
  const pct = meta > 0 ? Math.min(150, (real / meta) * 100) : 0;
  const tone = pct >= 100 ? "bg-success" : pct >= 80 ? "bg-warning" : "bg-destructive";
  return (
    <Shell>
      <div className="flex items-baseline justify-between">
        <span className="font-bold tabular-nums text-[clamp(1.8rem,7cqw,4.5rem)] leading-none">{nf(real, 0)}</span>
        <span className="text-lg text-muted-foreground">meta {nf(meta, 0)}</span>
      </div>
      <div className="h-5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="text-right text-xl font-semibold tabular-nums">{meta > 0 ? `${nf(pct, 0)}%` : "Defina a meta"}</div>
    </Shell>
  );
}

function TvParadas({ period, filters }: { period: DashboardPeriod; filters: DashboardFilters }) {
  const q = useQuery({
    queryKey: ["tv-paradas", period.start, period.end, filters.equipamentoId],
    refetchInterval: 30000,
    queryFn: async () => {
      let qq = supabase.from("paradas_equipamento").select("duracao_seg,inicio_em,fim_em,motivo,status")
        .gte("inicio_em", period.start).lte("inicio_em", period.end).limit(2000);
      if (filters.equipamentoId) qq = qq.eq("equipamento_id", filters.equipamentoId);
      const { data, error } = await qq;
      if (error) throw error;
      const motivos = new Map<string, number>();
      let total = 0, abertas = 0;
      for (const p of data ?? []) {
        const d = p.duracao_seg ?? (p.fim_em ? 0 : (Date.now() - new Date(p.inicio_em).getTime()) / 1000);
        if (!p.fim_em) abertas++;
        total += d;
        const m = p.motivo || "Sem motivo";
        motivos.set(m, (motivos.get(m) ?? 0) + d);
      }
      const top = [...motivos.entries()].sort((a, b) => b[1] - a[1])[0];
      return { qtd: data?.length ?? 0, total, abertas, top };
    },
  });
  const d = q.data;
  const h = Math.floor((d?.total ?? 0) / 3600), m = Math.round(((d?.total ?? 0) % 3600) / 60);
  return (
    <Shell>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div><div className={`font-bold tabular-nums text-5xl ${d?.abertas ? "text-destructive" : ""}`}>{d?.qtd ?? "—"}</div><div className="text-sm text-muted-foreground">paradas{d?.abertas ? ` · ${d.abertas} em aberto` : ""}</div></div>
        <div><div className="font-bold tabular-nums text-5xl">{h}h{String(m).padStart(2, "0")}</div><div className="text-sm text-muted-foreground">tempo parado</div></div>
      </div>
      {d?.top && <div className="truncate text-center text-base">Principal: <b>{d.top[0]}</b></div>}
    </Shell>
  );
}

function TvAlertas() {
  const q = useQuery({
    queryKey: ["tv-alertas"],
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.from("alertas_disparos").select("id,mensagem,severidade,created_at")
        .eq("status", "novo").order("created_at", { ascending: false }).limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = q.data ?? [];
  if (!rows.length) return <Shell><div className="flex items-center justify-center gap-2 text-2xl font-semibold text-success"><CheckCircle2 className="h-7 w-7" />Sem alertas ativos</div></Shell>;
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden p-3">
      {rows.map((a) => {
        const crit = /crit/i.test(a.severidade);
        return (
          <div key={a.id} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-lg ${crit ? "bg-destructive/20 font-bold text-destructive animate-pulse" : "bg-warning/15"}`}>
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="truncate">{a.mensagem}</span>
          </div>
        );
      })}
    </div>
  );
}

function TvTendencia({ widget }: { widget: W }) {
  const tag = String(widget.config.tag_nome ?? "");
  const min = num(widget.config.min), max = num(widget.config.max);
  const q = useQuery({
    queryKey: ["tv-tendencia", tag],
    refetchInterval: 30000,
    queryFn: async () => {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data } = await supabase.from("producao_tag_historico").select("valor_num,registrado_em")
        .eq("tag_nome", tag).gte("registrado_em", since).order("registrado_em").limit(1000);
      return (data ?? []).filter((r) => r.valor_num !== null).map((r) => ({
        t: new Date(r.registrado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), v: Number(r.valor_num),
      }));
    },
  });
  const rows = q.data ?? [];
  if (rows.length < 2) return <Shell><div className="text-center text-muted-foreground">Sem histórico nas últimas 6 horas</div></Shell>;
  return (
    <div className="h-full w-full p-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows}>
          <XAxis dataKey="t" tick={{ fontSize: 14 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 14 }} width={50} domain={["auto", "auto"]} />
          <Tooltip />
          {min !== null && <ReferenceLine y={min} stroke="var(--destructive)" strokeDasharray="4 4" />}
          {max !== null && <ReferenceLine y={max} stroke="var(--destructive)" strokeDasharray="4 4" />}
          <Area type="monotone" dataKey="v" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.2} strokeWidth={3} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
