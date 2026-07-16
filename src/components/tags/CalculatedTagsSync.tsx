// Sincroniza tags calculadas para a tabela tags_live a cada 5s,
// permitindo que alertas, monitoramento, SCADA e demais consumidores
// enxerguem os valores calculados como se fossem tags normais.
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { evaluateCalcTags, type CalcTag } from "@/lib/tags/calc";

const INTERVAL_MS = 5000;

export function CalculatedTagsSync() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user.id;
        if (!uid) return;

        const [{ data: calcRows }, { data: liveRows }] = await Promise.all([
          supabase
            .from("tags_calculadas" as never)
            .select("*")
            .eq("owner_id", uid)
            .eq("ativo", true),
          supabase
            .from("tags_live" as never)
            .select("nome,valor_num")
            .eq("owner_id", uid),
        ]);

        const calc = (calcRows ?? []) as unknown as CalcTag[];
        if (!calc.length) return;

        const base = new Map<string, number>();
        for (const r of (liveRows ?? []) as Array<{ nome: string; valor_num: number | null }>) {
          if (r.valor_num != null) base.set(r.nome, Number(r.valor_num));
        }

        const results = evaluateCalcTags(calc, base);
        const nowIso = new Date().toISOString();
        const upserts = calc
          .map((t) => {
            const r = results.get(t.nome);
            if (!r || r.valor == null) return null;
            return {
              nome: t.nome,
              nome_amigavel: t.nome_amigavel,
              valor: String(r.valor),
              valor_num: r.valor,
              valor_num_bruto: r.valor,
              unidade: t.unidade,
              grupo: t.grupo ?? "Calculadas",
              qualidade: "good",
              valor_min: t.valor_min,
              valor_max: t.valor_max,
              origem: "calculada",
              owner_id: uid,
              atualizado_em: nowIso,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;

        if (upserts.length && !cancelled) {
          await supabase
            .from("tags_live" as never)
            .upsert(upserts as never, { onConflict: "nome" });
        }
      } catch {
        // silencioso — próximo tick tenta de novo
      } finally {
        if (!cancelled) timer = setTimeout(tick, INTERVAL_MS);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
