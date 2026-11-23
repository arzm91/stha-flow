import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Soma dos incrementos positivos de um totalizador (ignora resets do contador). */
export function somaIncrementos(valores: number[]): number {
  let total = 0;
  for (let i = 1; i < valores.length; i++) {
    const d = valores[i]! - valores[i - 1]!;
    if (d > 0) total += d;
  }
  return total;
}

export type Ponto = { t: number; v: number };

/** Histórico de uma tag do equipamento nas últimas N horas, sem vínculo com OP. */
export function useHistoricoEquip(equipId: string | null | undefined, tag: string | null | undefined, horas = 24) {
  return useQuery({
    queryKey: ["hist-equip", equipId, tag, horas],
    enabled: !!equipId && !!tag,
    refetchInterval: 30_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - horas * 3600_000).toISOString();
      const out: Ponto[] = [];
      for (let from = 0; from < 30_000; from += 1000) {
        const { data, error } = await supabase.from("producao_tag_historico")
          .select("valor_num,registrado_em")
          .eq("equipamento_id", equipId!).eq("tag_nome", tag!)
          .gte("registrado_em", desde).order("registrado_em", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        for (const r of data ?? []) if (r.valor_num != null) out.push({ t: new Date(r.registrado_em).getTime(), v: Number(r.valor_num) });
        if ((data ?? []).length < 1000) break;
      }
      return out;
    },
  });
}

/** Paradas em aberto por equipamento (equipamento parado agora). */
export function useParadasAbertas() {
  return useQuery({
    queryKey: ["paradas-abertas"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await supabase.from("paradas_equipamento").select("equipamento_id,inicio_em").is("fim_em", null);
      return new Map((data ?? []).map((p) => [p.equipamento_id as string, p.inicio_em as string]));
    },
  });
}
