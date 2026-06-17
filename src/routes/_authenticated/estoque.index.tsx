import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Boxes, ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estoque/")({
  component: EstoquePage,
});

function EstoquePage() {
  const tanques = useQuery({
    queryKey: ["tanques"],
    queryFn: async () => (await supabase.from("tanques").select("*").order("codigo")).data ?? [],
  });
  const mov = useQuery({
    queryKey: ["movs-all"],
    queryFn: async () => (await supabase.from("movimentacoes_estoque").select("tanque_id,tipo,quantidade")).data ?? [],
  });

  const saldosPorTanque = new Map<string, number>();
  for (const m of mov.data ?? []) {
    if (!m.tanque_id) continue;
    const cur = saldosPorTanque.get(m.tanque_id) ?? 0;
    saldosPorTanque.set(m.tanque_id, cur + (m.tipo === "entrada" ? Number(m.quantidade) : -Number(m.quantidade)));
  }

  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Saldos por tanque e movimentações."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary"><Link to="/estoque/movimentacao"><ArrowDownToLine className="mr-2 h-4 w-4" />Movimentar</Link></Button>
            <Button asChild variant="outline"><Link to="/cadastros/tanques">Cadastrar tanque</Link></Button>
          </div>
        }
      />

      {tanques.data && tanques.data.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title="Sem tanques cadastrados"
          description="Cadastre tanques para começar a controlar o estoque."
          action={<Button asChild><Link to="/cadastros/tanques">Cadastrar tanque</Link></Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tanques.data?.map((t) => {
            const saldo = saldosPorTanque.get(t.id) ?? 0;
            return (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{t.codigo}</div>
                      <div className="text-base font-semibold">{t.nome}</div>
                    </div>
                    <Button asChild variant="ghost" size="icon">
                      <Link to="/estoque/tanques/$id" params={{ id: t.id }}><History className="h-4 w-4" /></Link>
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Saldo</div>
                      <div className="font-mono text-lg font-semibold text-primary">{formatNumber(saldo)}{t.unidade ? ` ${t.unidade}` : ""}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Capacidade</div>
                      <div className="font-mono text-sm">{t.capacidade ? formatNumber(Number(t.capacidade)) : "—"}{t.unidade ? ` ${t.unidade}` : ""}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
