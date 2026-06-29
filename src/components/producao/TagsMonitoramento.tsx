import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

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

export function TagsMonitoramento({
  ordemId,
  tagNomes,
  ativa,
}: {
  ordemId: string;
  tagNomes: string[];
  ativa: boolean;
}) {
  const hist = useQuery({
    queryKey: ["producao-tag-historico", ordemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producao_tag_historico")
        .select("id,tag_nome,valor_num,unidade,registrado_em")
        .eq("ordem_id", ordemId)
        .order("registrado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: ativa ? 5_000 : false,
  });

  const { tagsDisponiveis, unidades } = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const r of hist.data ?? []) {
      if (!map.has(r.tag_nome)) map.set(r.tag_nome, r.unidade);
      else if (!map.get(r.tag_nome) && r.unidade) map.set(r.tag_nome, r.unidade);
    }
    // garante todas as tags do equipamento, mesmo sem pontos ainda
    for (const n of tagNomes ?? []) if (!map.has(n)) map.set(n, null);
    return {
      tagsDisponiveis: Array.from(map.keys()),
      unidades: map,
    };
  }, [hist.data, tagNomes]);

  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  // seleciona automaticamente até 3 tags na primeira carga
  useEffect(() => {
    if (selecionadas.length === 0 && tagsDisponiveis.length > 0) {
      setSelecionadas(tagsDisponiveis.slice(0, Math.min(3, tagsDisponiveis.length)));
    }
  }, [tagsDisponiveis, selecionadas.length]);

  const corPorTag = useMemo(() => {
    const m = new Map<string, string>();
    tagsDisponiveis.forEach((n, i) => m.set(n, PALETTE[i % PALETTE.length]));
    return m;
  }, [tagsDisponiveis]);

  // Constrói dataset combinado: cada timestamp vira uma linha com colunas por tag
  const chartData = useMemo(() => {
    if (!hist.data || selecionadas.length === 0) return [];
    const byTs = new Map<number, Record<string, number | string>>();
    for (const r of hist.data) {
      if (!selecionadas.includes(r.tag_nome)) continue;
      if (r.valor_num == null) continue;
      const t = new Date(r.registrado_em).getTime();
      if (!byTs.has(t)) byTs.set(t, { t });
      byTs.get(t)![r.tag_nome] = Number(r.valor_num);
    }
    return Array.from(byTs.values()).sort((a, b) => (a.t as number) - (b.t as number));
  }, [hist.data, selecionadas]);

  // Estatísticas por tag selecionada
  const stats = useMemo(() => {
    const m = new Map<string, { min: number; max: number; avg: number; last: number; n: number }>();
    for (const nome of selecionadas) {
      const vals = (hist.data ?? [])
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
  }, [hist.data, selecionadas]);

  const toggle = (nome: string) => {
    setSelecionadas((cur) =>
      cur.includes(nome) ? cur.filter((n) => n !== nome) : [...cur, nome],
    );
  };

  if (!tagNomes || tagNomes.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChartIcon className="h-4 w-4 text-primary" />
          Monitoramento das tags
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {ativa ? "Gravando histórico (a cada ~10s)" : "Histórico desta produção"}
        </span>
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

        {/* Gráfico único combinado */}
        <div className="h-80 w-full">
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
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
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
              </LineChart>
            </ResponsiveContainer>
          )}
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
      </CardContent>
    </Card>
  );
}
