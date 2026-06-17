import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Factory, Boxes, ClipboardCheck, Activity, Play, CheckCircle2, Pause,
  ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Cpu,
} from "lucide-react";
import { formatInt, formatNumber, formatDuration } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const [eq, ops, prods, mov, anls, params] = await Promise.all([
        supabase.from("equipamentos").select("id,status,ativo"),
        supabase.from("ordens_producao").select("id,status,inicio_em,fim_em,qtd_produzida,equipamento_id"),
        supabase.from("produtos").select("id"),
        supabase.from("movimentacoes_estoque").select("id,tipo,quantidade,ocorrido_em"),
        supabase.from("analises_registradas").select("id,resultado,analise_id"),
        supabase.from("analises_cadastro").select("id,nome,valor_min,valor_max"),
      ]);

      const equip = eq.data ?? [];
      const ordens = ops.data ?? [];
      const movs = mov.data ?? [];
      const analises = anls.data ?? [];
      const paramsMap = new Map((params.data ?? []).map((p) => [p.id, p]));

      const emAndamento = ordens.filter((o) => o.status === "em_andamento").length;
      const finalizadas = ordens.filter((o) => o.status === "finalizada").length;
      const opEquip = equip.filter((e) => e.status === "ocupado").length;
      const equipParados = equip.filter((e) => e.status === "parado" || !e.ativo).length;

      const tempos = ordens
        .filter((o) => o.fim_em && o.inicio_em)
        .map((o) => new Date(o.fim_em!).getTime() - new Date(o.inicio_em).getTime());
      const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;
      const qtdTotal = ordens.reduce((s, o) => s + Number(o.qtd_produzida ?? 0), 0);

      const movHoje = movs.filter((m) => new Date(m.ocorrido_em) >= today);
      const entradas = movs.filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.quantidade), 0);
      const saidas = movs.filter((m) => m.tipo === "saida").reduce((s, m) => s + Number(m.quantidade), 0);
      const saldo = entradas - saidas;

      const naoConformes = analises.filter((a) => {
        const ref = paramsMap.get(a.analise_id);
        if (!ref) return false;
        const v = Number(a.resultado);
        if (ref.valor_min != null && v < Number(ref.valor_min)) return true;
        if (ref.valor_max != null && v > Number(ref.valor_max)) return true;
        return false;
      }).length;

      const eficiencia = ordens.length
        ? Math.min(100, (finalizadas / ordens.length) * 100)
        : 0;

      return {
        emAndamento, finalizadas, opEquip, equipParados,
        tempoMedio, qtdTotal,
        saldo, entradas, saidas, movHoje: movHoje.length,
        analisesTotal: analises.length, naoConformes,
        eficiencia,
        equipTotal: equip.length, produtos: (prods.data ?? []).length,
      };
    },
    refetchInterval: 30_000,
  });

  const d = q.data;
  const empty = !d || (d.equipTotal === 0 && d.produtos === 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visão executiva da operação industrial."
      />
      {empty ? (
        <EmptyState
          icon={<Cpu className="h-6 w-6" />}
          title="Bem-vindo ao STHApc"
          description="Comece cadastrando equipamentos e produtos para liberar todas as métricas."
          action={
            <div className="flex gap-2">
              <Button asChild><Link to="/cadastros/equipamentos">Cadastrar equipamento</Link></Button>
              <Button asChild variant="secondary"><Link to="/cadastros/produtos">Cadastrar produto</Link></Button>
            </div>
          }
        />
      ) : null}

      <section className="mt-2">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Produção</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Em andamento" value={formatInt(d?.emAndamento ?? 0)} icon={<Play className="h-4 w-4" />} tone="primary" to="/producao" />
          <KpiCard label="Finalizadas" value={formatInt(d?.finalizadas ?? 0)} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" to="/relatorios/producao" />
          <KpiCard label="Equip. operando" value={formatInt(d?.opEquip ?? 0)} icon={<Factory className="h-4 w-4" />} to="/producao" />
          <KpiCard label="Equip. parados" value={formatInt(d?.equipParados ?? 0)} icon={<Pause className="h-4 w-4" />} tone="warning" to="/cadastros/equipamentos" />
          <KpiCard label="Tempo médio" value={formatDuration(d?.tempoMedio)} icon={<Activity className="h-4 w-4" />} to="/indicadores" />
          <KpiCard label="Qtd. produzida" value={formatNumber(d?.qtdTotal ?? 0)} icon={<ClipboardCheck className="h-4 w-4" />} to="/relatorios/producao" />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Estoque</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Saldo atual" value={formatNumber(d?.saldo ?? 0)} icon={<Boxes className="h-4 w-4" />} tone="primary" to="/estoque" />
          <KpiCard label="Entradas" value={formatNumber(d?.entradas ?? 0)} icon={<ArrowDownToLine className="h-4 w-4" />} tone="success" to="/relatorios/estoque" />
          <KpiCard label="Saídas" value={formatNumber(d?.saidas ?? 0)} icon={<ArrowUpFromLine className="h-4 w-4" />} to="/relatorios/estoque" />
          <KpiCard label="Movim. de hoje" value={formatInt(d?.movHoje ?? 0)} to="/estoque/movimentacao" />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Qualidade</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <KpiCard label="Análises realizadas" value={formatInt(d?.analisesTotal ?? 0)} icon={<ClipboardCheck className="h-4 w-4" />} to="/relatorios/qualidade" />
          <KpiCard label="Não conformidades" value={formatInt(d?.naoConformes ?? 0)} icon={<AlertTriangle className="h-4 w-4" />} tone={d?.naoConformes ? "destructive" : "default"} to="/relatorios/qualidade" />
          <KpiCard label="Eficiência operacional" value={`${formatNumber(d?.eficiencia ?? 0, 1)}%`} icon={<Activity className="h-4 w-4" />} tone="success" to="/indicadores" />
        </div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Atalhos rápidos</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild><Link to="/producao/nova">Nova Ordem de Produção</Link></Button>
            <Button asChild variant="secondary"><Link to="/estoque/movimentacao">Movimentar estoque</Link></Button>
            <Button asChild variant="outline"><Link to="/cadastros/equipamentos">Cadastros</Link></Button>
            <Button asChild variant="outline"><Link to="/indicadores">Indicadores</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Indicadores gerais</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <KpiCard label="OEE estimado" value={`${formatNumber(d?.eficiencia ?? 0, 1)}%`} tone="primary" />
            <KpiCard label="Equipamentos" value={formatInt(d?.equipTotal ?? 0)} to="/cadastros/equipamentos" />
            <KpiCard label="Produtos" value={formatInt(d?.produtos ?? 0)} to="/cadastros/produtos" />
            <KpiCard label="Movimentações" value={formatInt((d?.entradas ?? 0) + (d?.saidas ?? 0) > 0 ? 1 : 0)} to="/estoque" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
