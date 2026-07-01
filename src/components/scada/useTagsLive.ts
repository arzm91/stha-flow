import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AlertaCfg, TagLive } from "./bindings";

export function useTagsLive() {
  const tagsQ = useQuery({
    queryKey: ["scada-tags-live"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live")
        .select("nome,valor,valor_num,unidade");
      if (error) throw error;
      return (data ?? []) as TagLive[];
    },
    refetchInterval: 2500,
  });

  const alertasQ = useQuery({
    queryKey: ["scada-alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas")
        .select("tag_nome,min_val,max_val,ativo,tipo")
        .eq("ativo", true)
        .eq("tipo", "tag_min_max");
      if (error) throw error;
      return (data ?? []) as AlertaCfg[];
    },
  });

  const tagsMap = useMemo(() => {
    const m = new Map<string, TagLive>();
    (tagsQ.data ?? []).forEach((t) => m.set(t.nome, t));
    return m;
  }, [tagsQ.data]);

  const alertasMap = useMemo(() => {
    const m = new Map<string, AlertaCfg>();
    (alertasQ.data ?? []).forEach((a) => { if (a.tag_nome) m.set(a.tag_nome, a); });
    return m;
  }, [alertasQ.data]);

  const tagNames = useMemo(
    () => (tagsQ.data ?? []).map((t) => t.nome).sort((a, b) => a.localeCompare(b)),
    [tagsQ.data],
  );

  return { tagsMap, alertasMap, tagNames };
}
