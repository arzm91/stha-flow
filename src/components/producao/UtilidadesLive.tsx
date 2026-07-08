// Exibe as utilidades vinculadas ao equipamento de produção, com status e tags ao vivo.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, AlertTriangle, Workflow, ChevronDown, ChevronUp } from "lucide-react";
import { ScadaViewer } from "@/components/scada/ScadaViewer";


type Utilidade = {
  id: string;
  codigo: string;
  nome: string;
  status: string;
  tipo: string | null;
  localizacao: string | null;
  tag_nomes: string[] | null;
};

type TagLive = {
  nome: string;
  nome_amigavel: string | null;
  valor_num: number | null;
  valor: string | null;
  unidade: string | null;
  atualizado_em: string | null;
};

const statusMap: Record<string, { label: string; cls: string; alert?: boolean }> = {
  disponivel: { label: "Disponível", cls: "bg-success/20 text-success border-success/30" },
  parado: { label: "Parado", cls: "bg-warning/20 text-warning border-warning/30", alert: true },
  ocupado: { label: "Ocupado", cls: "bg-primary/20 text-primary border-primary/30" },
  manutencao: { label: "Manutenção", cls: "bg-destructive/20 text-destructive border-destructive/30", alert: true },
};

export function UtilidadesLive({ equipamentoId }: { equipamentoId: string }) {
  const equip = useQuery({
    queryKey: ["equip-utilidades-ids", equipamentoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("utilidade_ids")
        .eq("id", equipamentoId)
        .maybeSingle();
      if (error) throw error;
      return (data?.utilidade_ids ?? []) as string[];
    },
  });

  const ids = equip.data ?? [];

  const utilidades = useQuery({
    queryKey: ["utilidades-live", ids.slice().sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("id,codigo,nome,status,tipo,localizacao,tag_nomes")
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as Utilidade[];
    },
    refetchInterval: 15_000,
  });

  const allTagNames = Array.from(
    new Set((utilidades.data ?? []).flatMap((u) => u.tag_nomes ?? [])),
  );

  const tagsQ = useQuery({
    queryKey: ["utilidades-tags", allTagNames.slice().sort().join(",")],
    enabled: allTagNames.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live")
        .select("nome,nome_amigavel,valor,valor_num,unidade,atualizado_em")
        .in("nome", allTagNames);
      if (error) throw error;
      return (data ?? []) as TagLive[];
    },
    refetchInterval: 5000,
  });

  if (ids.length === 0) return null;
  if (!utilidades.data || utilidades.data.length === 0) return null;

  const tagByName = new Map((tagsQ.data ?? []).map((t) => [t.nome, t]));
  const alerta = utilidades.data.some((u) => statusMap[u.status]?.alert);

  return (
    <Card className={`mb-4 ${alerta ? "border-destructive/60" : ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Utilidades vinculadas
          </span>
          {alerta ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Uma ou mais utilidades indisponíveis
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {utilidades.data.map((u) => {
            const st = statusMap[u.status] ?? { label: u.status, cls: "" };
            const tags = (u.tag_nomes ?? []).map((n) => tagByName.get(n)).filter(Boolean) as TagLive[];
            return (
              <div
                key={u.id}
                className={`rounded-md border p-3 ${st.alert ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] text-muted-foreground">{u.codigo}</div>
                    <div className="truncate text-sm font-semibold">{u.nome}</div>
                    {(u.tipo || u.localizacao) && (
                      <div className="truncate text-xs text-muted-foreground">
                        {[u.tipo, u.localizacao].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className={st.cls + " shrink-0"}>{st.label}</Badge>
                </div>
                {tags.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {tags.map((t) => (
                      <div key={t.nome} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground">
                          {t.nome_amigavel?.trim() || t.nome}
                        </span>
                        <span className="font-mono font-semibold text-primary">
                          {t.valor_num != null
                            ? t.valor_num.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                            : (t.valor ?? "—")}
                          {t.unidade ? ` ${t.unidade}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">Sem tags monitoradas.</div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Faixa compacta de KPIs no topo — mostra 1 tag principal por utilidade.
export function UtilidadesStrip({ equipamentoId }: { equipamentoId: string }) {
  const equip = useQuery({
    queryKey: ["equip-utilidades-ids-strip", equipamentoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("equipamentos")
        .select("utilidade_ids")
        .eq("id", equipamentoId)
        .maybeSingle();
      return (data?.utilidade_ids ?? []) as string[];
    },
  });
  const ids = equip.data ?? [];

  const utilidades = useQuery({
    queryKey: ["utilidades-strip", ids.slice().sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("equipamentos")
        .select("id,codigo,nome,status,tag_nomes")
        .in("id", ids);
      return (data ?? []) as Array<{ id: string; codigo: string; nome: string; status: string; tag_nomes: string[] | null }>;
    },
    refetchInterval: 15_000,
  });

  const firstTags = Array.from(
    new Set((utilidades.data ?? []).map((u) => (u.tag_nomes ?? [])[0]).filter(Boolean) as string[]),
  );

  const tagsQ = useQuery({
    queryKey: ["utilidades-strip-tags", firstTags.slice().sort().join(",")],
    enabled: firstTags.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("tags_live")
        .select("nome,valor,valor_num,unidade")
        .in("nome", firstTags);
      return (data ?? []) as Array<{ nome: string; valor: string | null; valor_num: number | null; unidade: string | null }>;
    },
    refetchInterval: 5000,
  });

  if (ids.length === 0 || !utilidades.data || utilidades.data.length === 0) return null;
  const tagByName = new Map((tagsQ.data ?? []).map((t) => [t.nome, t]));

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Wrench className="h-3 w-3" /> Utilidades
      </span>
      {utilidades.data.map((u) => {
        const st = statusMap[u.status] ?? { label: u.status, cls: "" };
        const firstTagName = (u.tag_nomes ?? [])[0];
        const tag = firstTagName ? tagByName.get(firstTagName) : undefined;
        return (
          <div
            key={u.id}
            className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${st.alert ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"}`}
            title={u.nome}
          >
            <span className="font-medium">{u.nome}</span>
            <Badge variant="outline" className={st.cls + " px-1.5 py-0 text-[10px]"}>{st.label}</Badge>
            {tag ? (
              <span className="font-mono font-semibold text-primary">
                {tag.valor_num != null
                  ? tag.valor_num.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                  : (tag.valor ?? "—")}
                {tag.unidade ? ` ${tag.unidade}` : ""}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
