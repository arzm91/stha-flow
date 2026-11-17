import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProdutoAtivo = { id: string; nome: string; concentracao: number | null };

/** Produto em operação por equipamento, conforme vínculo produto → equipamento + tag CLP + valor (0/1). */
export function useProdutosAtivos(equipamentoIds: string[]) {
  const key = [...equipamentoIds].sort().join(",");
  return useQuery({
    queryKey: ["produtos-ativos", key],
    enabled: equipamentoIds.length > 0,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data: prods } = await supabase.from("produtos")
        .select("id,nome,concentracao,equipamento_id,tag_clp,tag_valor_ativacao")
        .in("equipamento_id", equipamentoIds).not("tag_clp", "is", null);
      const list = (prods ?? []) as Array<{ id: string; nome: string; concentracao: number | null; equipamento_id: string; tag_clp: string; tag_valor_ativacao: number | null }>;
      const tags = Array.from(new Set(list.map((p) => p.tag_clp)));
      const vals = new Map<string, number | null>();
      if (tags.length) {
        const { data } = await supabase.from("tags_live").select("nome,valor_num").in("nome", tags);
        for (const t of data ?? []) vals.set(t.nome, t.valor_num != null ? Number(t.valor_num) : null);
      }
      const out: Record<string, ProdutoAtivo> = {};
      for (const p of list) {
        const v = vals.get(p.tag_clp);
        if (v == null || p.tag_valor_ativacao == null) continue;
        if (Math.round(v) === Number(p.tag_valor_ativacao) && !out[p.equipamento_id]) {
          out[p.equipamento_id] = { id: p.id, nome: p.nome, concentracao: p.concentracao != null ? Number(p.concentracao) : null };
        }
      }
      return out;
    },
  });
}
