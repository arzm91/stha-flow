import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/KpiCard";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from "recharts";
import { formatDuration, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/indicadores")({
  component: IndicadoresPage,
});

function IndicadoresPage() {
  const ops = useQuery({
    queryKey: ["ind-ops"],
    queryFn: async () => (await supabase.from("ordens_producao")
      .select("*, produto:produto_id(nome), equipamento:equipamento_id(nome,codigo)")).data ?? [],
  });
  const mov = useQuery({
    queryKey: ["ind-mov"],
    queryFn: async () => (await supabase.from("movimentacoes_estoque").select("tipo,quantidade,ocorrido_em")).data ?? [],
  });

  const rows = ops.data ?? [];
  const finalizadas = rows.filter((r) => r.status === "finalizada");

  // produção diária últimos 14 dias
  const dias = [...Array(14)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i)); d.setHours(0, 0, 0, 0);
    return d;
  });
  const prodDiaria = dias.map((d) => {
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const v = finalizadas.filter((r) => r.fim_em && new Date(r.fim_em) >= d && new Date(r.fim_em) < next)
      .reduce((s, r) => s + Number(r.qtd_produzida ?? 0), 0);
    return { dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), valor: v };
  });

  // produção mensal últimos 6 meses
  const meses = [...Array(6)].map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); d.setDate(1); d.setHours(0, 0, 0, 0);
    return d;
  });
  const prodMensal = meses.map((d) => {
    const next = new Date(d); next.setMonth(d.getMonth() + 1);
    const v = finalizadas.filter((r) => r.fim_em && new Date(r.fim_em) >= d && new Date(r.fim_em) < next)
      .reduce((s, r) => s + Number(r.qtd_produzida ?? 0), 0);
    return { mes: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), valor: v };
  });

  // por equipamento
  const porEquip = Object.entries(
    finalizadas.reduce((acc: Record<string, number>, r) => {
      const k = (r.equipamento as any)?.nome ?? "—";
      acc[k] = (acc[k] ?? 0) + Number(r.qtd_produzida ?? 0);
      return acc;
    }, {})
  ).map(([nome, valor]) => ({ nome, valor }));

  // por produto
  const porProduto = Object.entries(
    finalizadas.reduce((acc: Record<string, number>, r) => {
      const k = (r.produto as any)?.nome ?? "—";
      acc[k] = (acc[k] ?? 0) + Number(r.qtd_produzida ?? 0);
      return acc;
    }, {})
  ).map(([nome, valor]) => ({ nome, valor }));

  const tempos = finalizadas
    .filter((r) => r.fim_em && r.inicio_em)
    .map((r) => new Date(r.fim_em!).getTime() - new Date(r.inicio_em!).getTime());
  const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;

  const eficiencia = rows.length ? (finalizadas.length / rows.length) * 100 : 0;
  const entradas = (mov.data ?? []).filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.quantidade), 0);
  const saidas = (mov.data ?? []).filter((m) => m.tipo === "saida").reduce((s, m) => s + Number(m.quantidade), 0);
  const giro = entradas > 0 ? (saidas / entradas) * 100 : 0;

  return (
    <div>
      <PageHeader title="Indicadores" description="KPIs operacionais, produtivos e de estoque." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Eficiência operacional" value={`${formatNumber(eficiencia, 1)}%`} tone="primary" />
        <KpiCard label="Tempo médio de produção" value={formatDuration(tempoMedio)} />
        <KpiCard label="Saldo de estoque" value={formatNumber(entradas - saidas)} tone="success" />
        <KpiCard label="Giro de estoque" value={`${formatNumber(giro, 1)}%`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Produção diária (últimos 14 dias)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={prodDiaria}>
              <CartesianGrid strokeOpacity={0.1} />
              <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="valor" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Produção mensal (últimos 6 meses)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={prodMensal}>
              <CartesianGrid strokeOpacity={0.1} />
              <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey="valor" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Produção por equipamento">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porEquip} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeOpacity={0.1} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis type="category" dataKey="nome" stroke="var(--muted-foreground)" fontSize={11} width={120} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey="valor" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Produção por produto">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porProduto} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeOpacity={0.1} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis type="category" dataKey="nome" stroke="var(--muted-foreground)" fontSize={11} width={120} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey="valor" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
