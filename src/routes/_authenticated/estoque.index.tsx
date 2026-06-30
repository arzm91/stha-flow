import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Boxes, ArrowDownToLine } from "lucide-react";
import { StorageLocationCard, type StorageLocation } from "@/components/StorageLocationCard";
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
    queryFn: async () => (await supabase.from("movimentacoes_estoque").select("tanque_id,tipo,quantidade")).data ?? [],
  });
  const tagsLive = useQuery({
    queryKey: ["tags-live-all"],
    queryFn: async () => (await supabase.from("tags_live").select("nome,valor,valor_num,unidade")).data ?? [],
    refetchInterval: 15000,
  });

  const saldosPorTanque = new Map<string, number>();
  for (const m of mov.data ?? []) {
    if (!m.tanque_id) continue;
    const cur = saldosPorTanque.get(m.tanque_id) ?? 0;
    saldosPorTanque.set(m.tanque_id, cur + (m.tipo === "entrada" ? Number(m.quantidade) : -Number(m.quantidade)));
  }
  const tagByName = new Map<string, { nome: string; valor: string | null; valor_num: number | null; unidade: string | null }>();
  for (const t of tagsLive.data ?? []) tagByName.set(t.nome, t);

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
            return <StorageLocationCard key={t.id} loc={t} saldo={saldo} tag={tag} />;
          })}
        </div>
      )}

    </div>
  );
}
