import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { formatNumber } from "@/lib/format";

type Row = {
  id: string;
  tag_nome: string;
  valor_num: number | null;
  unidade: string | null;
  registrado_em: string;
};

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

  const grupos = useMemo(() => {
    const byTag = new Map<string, Row[]>();
    for (const r of hist.data ?? []) {
      if (!byTag.has(r.tag_nome)) byTag.set(r.tag_nome, []);
      byTag.get(r.tag_nome)!.push(r);
    }
    // ordem estável seguindo tagNomes do equipamento + extras
    const lista: { nome: string; rows: Row[] }[] = [];
    const seen = new Set<string>();
    for (const n of tagNomes ?? []) {
      if (byTag.has(n)) {
        lista.push({ nome: n, rows: byTag.get(n)! });
        seen.add(n);
      }
    }
    for (const [n, rows] of byTag) {
      if (!seen.has(n)) lista.push({ nome: n, rows });
    }
    return lista;
  }, [hist.data, tagNomes]);

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
      <CardContent>
        {hist.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando histórico...</p>
        ) : grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum ponto registrado ainda. Os valores numéricos das tags do equipamento serão gravados
            automaticamente enquanto a produção estiver em andamento.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {grupos.map(({ nome, rows }) => {
              const data = rows
                .filter((r) => r.valor_num != null)
                .map((r) => ({
                  t: new Date(r.registrado_em).getTime(),
                  v: Number(r.valor_num),
                }));
              const unidade = rows.find((r) => r.unidade)?.unidade ?? "";
              const vals = data.map((d) => d.v);
              const min = vals.length ? Math.min(...vals) : null;
              const max = vals.length ? Math.max(...vals) : null;
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
              const last = data[data.length - 1]?.v ?? null;
              return (
                <div key={nome} className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <div className="truncate font-mono text-xs text-muted-foreground" title={nome}>
                      {nome}
                    </div>
                    <div className="font-mono text-sm font-semibold tabular-nums">
                      {last != null ? formatNumber(last) : "—"}
                      {unidade ? <span className="ml-1 text-xs text-muted-foreground">{unidade}</span> : null}
                    </div>
                  </div>
                  <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(t) =>
                            new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                          }
                          tick={{ fontSize: 10 }}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={36} />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            fontSize: 12,
                          }}
                          labelFormatter={(t) => new Date(Number(t)).toLocaleString("pt-BR")}
                          formatter={(v: number) => [`${formatNumber(v)}${unidade ? " " + unidade : ""}`, nome]}
                        />
                        {avg != null ? (
                          <ReferenceLine y={avg} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                        ) : null}
                        <Line
                          type="monotone"
                          dataKey="v"
                          stroke="hsl(var(--primary))"
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                    <span>min: <span className="font-mono text-foreground">{min != null ? formatNumber(min) : "—"}</span></span>
                    <span>méd: <span className="font-mono text-foreground">{avg != null ? formatNumber(avg) : "—"}</span></span>
                    <span>máx: <span className="font-mono text-foreground">{max != null ? formatNumber(max) : "—"}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
