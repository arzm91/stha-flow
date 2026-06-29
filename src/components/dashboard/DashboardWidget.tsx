import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getSource } from "@/lib/dashboard/widget-catalog";
import { formatInt, formatNumber } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

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
  return <WidgetBody widget={widget} />;
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

  return null;
}

// ============ Data fetchers ============

type WidgetData =
  | { kind: "kpi"; value: string; hint?: string; tone?: string; to?: string }
  | { kind: "bar"; points: { label: string; value: number }[] }
  | { kind: "line"; points: { label: string; entrada: number; saida: number }[] }
  | { kind: "pie"; points: { label: string; value: number }[] }
  | { kind: "list"; items: { title: string; subtitle?: string; value?: string }[] }
  | { kind: "gauge"; value: number; max: number; unit?: string; tag: string };

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
      const { data } = await supabase.from("movimentacoes_estoque").select("tipo,quantidade");
      const saldo = (data ?? []).reduce((s, r) => s + (r.tipo === "entrada" ? 1 : -1) * Number(r.quantidade), 0);
      return { kind: "kpi", value: formatNumber(saldo), tone: "text-primary", to: "/estoque" };
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
      const { data } = await supabase.from("movimentacoes_estoque").select("tipo,quantidade,ocorrido_em,observacao")
        .order("ocorrido_em", { ascending: false }).limit(10);
      return {
        kind: "list",
        items: (data ?? []).map((r) => ({
          title: `${r.tipo === "entrada" ? "↑" : "↓"} ${formatNumber(Number(r.quantidade))}`,
          subtitle: r.observacao ?? "",
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
        .lt("prazo", new Date().toISOString()).in("status", ["aberta", "em_andamento"]);
      return { kind: "kpi", value: formatInt(count ?? 0), tone: "text-destructive", to: "/manutencao" };
    }
    case "list.manutencao.proximas": {
      const { data } = await supabase.from("ordens_manutencao").select("titulo,prazo,status,prioridade")
        .in("status", ["aberta", "em_andamento"]).order("prazo", { ascending: true }).limit(10);
      return {
        kind: "list",
        items: (data ?? []).map((r) => ({
          title: r.titulo ?? "OS",
          subtitle: r.prioridade ?? "",
          value: r.prazo ? new Date(r.prazo).toLocaleDateString("pt-BR") : "",
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
