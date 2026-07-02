import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Boxes, ArrowDownToLine } from "lucide-react";
import { StorageLocationCard, type StorageLocation, type LatestAnalise } from "@/components/StorageLocationCard";
import { TanqueAjusteDialog } from "@/components/TanqueAjusteDialog";
import { useResourcePermissions } from "@/hooks/useResourcePermissions";


export const Route = createFileRoute("/_authenticated/estoque/")({
  component: EstoquePage,
});

function EstoquePage() {
  const resPerms = useResourcePermissions();
  const tanques = useQuery({
    queryKey: ["tanques"],
    queryFn: async () => (await supabase.from("tanques").select("*").order("codigo")).data ?? [],
  });
  const visibleTanques = resPerms.filter("tanque", tanques.data as { id: string }[] | undefined);

  const mov = useQuery({
    queryKey: ["movs-all"],
    queryFn: async () => (await supabase.from("movimentacoes_estoque").select("tanque_id,tipo,quantidade,ocorrido_em")).data ?? [],
  });
  const ajustes = useQuery({
    queryKey: ["tanque-ajustes"],
    queryFn: async () => (await supabase.from("tanque_ajustes_saldo")
      .select("tanque_id,saldo,ajustado_em")
      .order("ajustado_em", { ascending: false })).data ?? [],
  });
  const analisesLatest = useQuery({
    queryKey: ["tanque-analises-latest"],
    queryFn: async () => (await supabase.from("tanque_analises")
      .select("tanque_id,resultado,registrado_em,analise:analise_id(nome,unidade,valor_min,valor_max)")
      .order("registrado_em", { ascending: false })).data ?? [],
  });
  const tagsLive = useQuery({
    queryKey: ["tags-live-all"],
    queryFn: async () => (await supabase.from("tags_live").select("nome,valor,valor_num,unidade")).data ?? [],
    refetchInterval: 15000,
  });

  const { saldosPorTanque, analisePorTanque } = useMemo(() => {
    // último ajuste por tanque
    const ultimoAjuste = new Map<string, { saldo: number; ts: number }>();
    for (const a of ajustes.data ?? []) {
      if (!a.tanque_id) continue;
      if (!ultimoAjuste.has(a.tanque_id)) {
        ultimoAjuste.set(a.tanque_id, { saldo: Number(a.saldo), ts: new Date(a.ajustado_em).getTime() });
      }
    }
    // saldo = baseline + Σ movs após ajuste (ou Σ tudo se sem ajuste)
    const saldos = new Map<string, number>();
    for (const [tid, aj] of ultimoAjuste) saldos.set(tid, aj.saldo);
    for (const m of mov.data ?? []) {
      if (!m.tanque_id) continue;
      const aj = ultimoAjuste.get(m.tanque_id);
      if (aj && new Date(m.ocorrido_em).getTime() <= aj.ts) continue;
      const cur = saldos.get(m.tanque_id) ?? 0;
      saldos.set(m.tanque_id, cur + (m.tipo === "entrada" ? Number(m.quantidade) : -Number(m.quantidade)));
    }

    const ultimaAnalise = new Map<string, LatestAnalise>();
    for (const a of analisesLatest.data ?? []) {
      if (!a.tanque_id) continue;
      if (ultimaAnalise.has(a.tanque_id)) continue;
      const cad = a.analise as { nome: string; unidade: string | null; valor_min: number | null; valor_max: number | null } | null;
      ultimaAnalise.set(a.tanque_id, {
        nome: cad?.nome ?? null,
        resultado: Number(a.resultado),
        unidade: cad?.unidade ?? null,
        valor_min: cad?.valor_min != null ? Number(cad.valor_min) : null,
        valor_max: cad?.valor_max != null ? Number(cad.valor_max) : null,
        registrado_em: a.registrado_em,
      });
    }
    return { saldosPorTanque: saldos, analisePorTanque: ultimaAnalise };
  }, [mov.data, ajustes.data, analisesLatest.data]);

  const tagByName = new Map<string, { nome: string; valor: string | null; valor_num: number | null; unidade: string | null }>();
  for (const t of tagsLive.data ?? []) tagByName.set(t.nome, t);

  const [ajusteAlvo, setAjusteAlvo] = useState<StorageLocation | null>(null);

  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Saldos e leituras por local de armazenamento."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary"><Link to="/estoque/movimentacao"><ArrowDownToLine className="mr-2 h-4 w-4" />Movimentar</Link></Button>
            <Button asChild variant="outline"><Link to="/cadastros/tanques">Cadastrar local</Link></Button>
          </div>
        }
      />

      {tanques.data && visibleTanques.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title="Sem locais visíveis"
          description="Cadastre tanques, containers, pallets ou outros locais, ou peça ao administrador para liberar o acesso aos locais existentes."
          action={<Button asChild><Link to="/cadastros/tanques">Cadastrar local</Link></Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(visibleTanques as unknown as StorageLocation[]).map((t) => {
            const saldo = saldosPorTanque.get(t.id) ?? 0;
            const tag = t.tag_nivel_nome ? tagByName.get(t.tag_nivel_nome) ?? null : null;
            const analise = analisePorTanque.get(t.id) ?? null;
            return (
              <StorageLocationCard
                key={t.id}
                loc={t}
                saldo={saldo}
                tag={tag}
                latestAnalise={analise}
                onAdjust={() => setAjusteAlvo(t)}
              />
            );
          })}
        </div>
      )}

      <TanqueAjusteDialog
        open={!!ajusteAlvo}
        onOpenChange={(o) => { if (!o) setAjusteAlvo(null); }}
        tanque={ajusteAlvo}
        saldoAtual={ajusteAlvo ? saldosPorTanque.get(ajusteAlvo.id) ?? 0 : 0}
      />
    </div>
  );
}
