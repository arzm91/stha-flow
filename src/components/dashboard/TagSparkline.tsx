import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, History } from "lucide-react";

/**
 * Minigráfico de variação da tag para o canto inferior direito do card.
 * Busca os últimos 20 pontos em producao_tag_historico.
 * Se não houver histórico, não renderiza nada.
 */
export function TagSparkline({ tagNome, points = 20 }: { tagNome: string; points?: number }) {
  const q = useQuery({
    queryKey: ["tag-sparkline", tagNome, points],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producao_tag_historico")
        .select("valor_num,registrado_em")
        .eq("tag_nome", tagNome)
        .not("valor_num", "is", null)
        .order("registrado_em", { ascending: false })
        .limit(points);
      if (error) throw error;
      const rows = (data ?? [])
        .map((r) => ({ v: Number(r.valor_num), t: r.registrado_em }))
        .filter((r) => Number.isFinite(r.v))
        .reverse();
      return rows;
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  });

  const rows = q.data ?? [];
  if (q.isError || rows.length < 2) return null;

  const first = rows[0].v;
  const last = rows[rows.length - 1].v;
  const pct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : (last === 0 ? 0 : 100);
  const up = pct >= 0;
  const stale = Date.now() - new Date(rows[rows.length - 1].t).getTime() > 24 * 3600_000;
  const color = up ? "var(--success)" : "var(--destructive)";

  return (
    <div
      className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-end gap-1 rounded-md bg-background/70 px-1.5 py-0.5 backdrop-blur-sm"
      title={`${stale ? "Histórico sem atualização recente · " : ""}Variação dos últimos ${rows.length} pontos: ${pct.toFixed(2)}%`}
    >
      <div className="h-6 w-14">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className={`flex items-center text-[10px] font-semibold ${up ? "text-success" : "text-destructive"}`}>
        {stale ? <History className="h-2.5 w-2.5 text-muted-foreground" /> : up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
        <span className="ml-0.5 font-mono">{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function TagMiniTrend({ tagNome }: { tagNome: string }) {
  const q = useQuery({
    queryKey: ["tag-mini-trend", tagNome],
    queryFn: async () => {
      const { data, error } = await supabase.from("producao_tag_historico")
        .select("valor_num,registrado_em").eq("tag_nome", tagNome).not("valor_num", "is", null)
        .order("registrado_em", { ascending: false }).limit(16);
      if (error) throw error;
      return (data ?? []).map((r) => ({ v: Number(r.valor_num), t: r.registrado_em })).filter((r) => Number.isFinite(r.v)).reverse();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const rows = q.data ?? [];
  if (rows.length < 2) return null;
  const first = rows[0].v;
  const last = rows[rows.length - 1].v;
  const pct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : (last === 0 ? 0 : 100);
  const up = pct >= 0;
  return (
    <div className={`flex shrink-0 items-center gap-1 text-[10px] font-semibold ${up ? "text-success" : "text-destructive"}`} title={`Variação dos últimos ${rows.length} pontos`}>
      <div className="h-4 w-10">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><Line type="monotone" dataKey="v" stroke={up ? "var(--success)" : "var(--destructive)"} strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
      </div>
      <span>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
    </div>
  );
}
