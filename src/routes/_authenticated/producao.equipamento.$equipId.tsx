import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ParadasSection } from "@/components/paradas/ParadasSection";
import { ScadaViewer } from "@/components/scada/ScadaViewer";
import { UtilidadesLive } from "@/components/producao/UtilidadesLive";
import { useProdutosAtivos } from "@/lib/producao/produto-ativo";
import { calcularIndice, parseIndices } from "@/lib/indices/calc";
import { durationFromNow } from "@/lib/format";
import { somaIncrementos, useHistoricoEquip, useParadasAbertas } from "@/lib/producao/producao-24h";

export const Route = createFileRoute("/_authenticated/producao/equipamento/$equipId")({
  head: pageHead({ title: "Produção · Acompanhar equipamento — STHApc", description: "Acompanhamento contínuo do equipamento nas últimas 24 horas: produção, velocidade, índices, paradas e tags.", path: (p) => `/producao/equipamento/${p.equipId}` }),
  component: EquipPage,
});

const fmt = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));

function EquipPage() {
  const { equipId } = Route.useParams() as { equipId: string };
  const [desde] = useState(() => new Date(Date.now() - 24 * 3600_000).toISOString());

  const equipQ = useQuery({
    queryKey: ["equip-live", equipId],
    queryFn: async () => (await supabase.from("equipamentos").select("*").eq("id", equipId).maybeSingle()).data,
  });
  const e = equipQ.data as null | { id: string; codigo: string; nome: string; status: string; tag_nomes: string[] | null; tag_producao_total: string | null; tag_velocidade_producao: string | null; tag_velocidade_consumo: string | null; tag_indices: string[] | null; indices_config: unknown };
  const ativos = useProdutosAtivos(e ? [e.id] : []);
  const produto = e ? ativos.data?.[e.id] ?? null : null;
  const paradas = useParadasAbertas();
  const paradaDesde = paradas.data?.get(equipId) ?? null;
  const cfg = parseIndices(e?.indices_config).filter((c) => c.tag || c.formula);

  const tagNomes = Array.from(new Set([
    ...((e?.tag_nomes ?? []) as string[]), e?.tag_producao_total, e?.tag_velocidade_producao, e?.tag_velocidade_consumo,
    ...((e?.tag_indices ?? []) as string[]),
    ...cfg.flatMap((c) => [c.tag, ...((c.formula || "").match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? [])]).filter((v) => v !== "VALOR" && v !== "CONC_PROD"),
  ].filter(Boolean) as string[]));
  const tagsQ = useQuery({
    queryKey: ["equip-live-tags", tagNomes.join(",")],
    enabled: tagNomes.length > 0,
    refetchInterval: 5000,
    queryFn: async () => (await supabase.from("tags_live").select("nome,nome_amigavel,valor_num,valor,unidade,atualizado_em").in("nome", tagNomes)).data ?? [],
  });
  const tagMap = new Map((tagsQ.data ?? []).map((t) => [t.nome, t]));

  const histProd = useHistoricoEquip(e?.id, e?.tag_producao_total);
  const histVel = useHistoricoEquip(e?.id, e?.tag_velocidade_producao);
  const prod24 = somaIncrementos((histProd.data ?? []).map((p) => p.v));
  const velMedia = (histVel.data ?? []).length ? (histVel.data ?? []).reduce((s, p) => s + p.v, 0) / (histVel.data ?? []).length : null;
  const unid = e?.tag_producao_total ? tagMap.get(e.tag_producao_total)?.unidade ?? "" : "";
  const vel = e?.tag_velocidade_producao ? tagMap.get(e.tag_velocidade_producao) : undefined;

  if (!e) return <div className="p-6 text-muted-foreground">{equipQ.isLoading ? "Carregando..." : "Equipamento não encontrado."}</div>;

  const grafico = (histVel.data ?? []).filter((_, i, a) => a.length < 600 || i % Math.ceil(a.length / 600) === 0)
    .map((p) => ({ t: p.t, v: p.v }));

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/producao"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link>
      </Button>
      <PageHeader
        title={`${e.codigo} — ${e.nome}`}
        description="Monitoramento contínuo das últimas 24 horas."
        actions={<Button asChild variant="outline"><Link to="/relatorios/$slug" params={{ slug: "producao-periodo" }}><FileText className="mr-2 h-4 w-4" />Relatório por período</Link></Button>}
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Status">
          {e.status === "manutencao" ? <Badge variant="outline">Manutenção</Badge>
            : paradaDesde ? <Badge variant="destructive">Parado há {durationFromNow(paradaDesde)}</Badge>
            : <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Em operação</Badge>}
        </Kpi>
        <Kpi label="Produto ativo"><span className="font-semibold">{produto?.nome ?? "—"}</span>{produto?.concentracao != null ? <span className="text-xs text-muted-foreground"> · {produto.concentracao}%</span> : null}</Kpi>
        <Kpi label="Produzido 24h"><span className="font-mono text-xl font-semibold text-primary">{e.tag_producao_total ? fmt(prod24) : "—"}</span> <span className="text-xs">{unid}</span></Kpi>
        <Kpi label="Velocidade atual"><span className="font-mono text-xl font-semibold">{fmt(vel?.valor_num)}</span> <span className="text-xs">{vel?.unidade ?? ""}</span></Kpi>
        <Kpi label="Velocidade média 24h"><span className="font-mono text-xl font-semibold">{fmt(velMedia)}</span> <span className="text-xs">{vel?.unidade ?? ""}</span></Kpi>
      </div>

      {cfg.length > 0 ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {cfg.map((c, i) => {
            const v = calcularIndice(c, (n) => tagMap.get(n)?.valor_num ?? null, produto?.concentracao ?? null);
            return <Kpi key={i} label={c.nome || c.tag || "Índice"}><span className="font-mono text-lg font-semibold">{v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: c.decimais, maximumFractionDigits: c.decimais }) : "—"}</span> <span className="text-xs">{c.unidade ?? ""}</span></Kpi>;
          })}
        </div>
      ) : null}

      <Tabs defaultValue="monitor">
        <TabsList>
          <TabsTrigger value="monitor">Monitoramento</TabsTrigger>
          <TabsTrigger value="paradas">Paradas 24h</TabsTrigger>
          <TabsTrigger value="sinotico">Sinóptico e utilidades</TabsTrigger>
        </TabsList>
        <TabsContent value="monitor" className="space-y-3">
          {e.tag_velocidade_producao ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Velocidade de produção — 24h</CardTitle></CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={grafico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} fontSize={11} />
                    <YAxis fontSize={11} width={50} />
                    <Tooltip labelFormatter={(t) => new Date(Number(t)).toLocaleString("pt-BR")} />
                    <Line type="monotone" dataKey="v" dot={false} stroke="var(--color-primary, currentColor)" strokeWidth={2} name="Velocidade" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Tags do equipamento</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tagNomes.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma tag vinculada.</div> : tagNomes.map((n) => {
                const t = tagMap.get(n);
                return (
                  <div key={n} className="rounded-md border bg-muted/30 p-2">
                    <div className="truncate text-xs text-muted-foreground" title={n}>{t?.nome_amigavel?.trim() || n}</div>
                    <div className="font-mono font-semibold">{t?.valor_num != null ? fmt(t.valor_num, 3) : t?.valor ?? "—"} <span className="text-xs">{t?.unidade ?? ""}</span></div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="paradas"><ParadasSection equipamentoId={e.id} inicioEm={desde} /></TabsContent>
        <TabsContent value="sinotico" className="space-y-3">
          <ScadaViewer equipamentoId={e.id} />
          <UtilidadesLive equipamentoId={e.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return <Card><CardContent className="p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1">{children}</div></CardContent></Card>;
}
