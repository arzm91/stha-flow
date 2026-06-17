import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Factory, Play, Eye } from "lucide-react";
import { durationFromNow } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/producao")({
  component: ProducaoPage,
});

function ProducaoPage() {
  const equipamentos = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("*").eq("ativo", true).order("codigo");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const opsAtivas = useQuery({
    queryKey: ["ops-ativas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_producao")
        .select("id,numero,equipamento_id,inicio_em,produto:produto_id(nome,codigo)")
        .eq("status", "em_andamento");
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const opByEquip = new Map(
    (opsAtivas.data ?? []).map((o) => [o.equipamento_id, o])
  );

  return (
    <div>
      <PageHeader
        title="Produção"
        description="Equipamentos disponíveis e produções em andamento."
        actions={
          <Button asChild>
            <Link to="/producao/nova"><Play className="mr-2 h-4 w-4" />Nova ordem</Link>
          </Button>
        }
      />

      {equipamentos.data && equipamentos.data.length === 0 ? (
        <EmptyState
          icon={<Factory className="h-6 w-6" />}
          title="Nenhum equipamento ativo"
          description="Cadastre equipamentos para começar a registrar produções."
          action={<Button asChild><Link to="/cadastros/equipamentos">Cadastrar equipamento</Link></Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {equipamentos.data?.map((e) => {
            const op = opByEquip.get(e.id);
            return (
              <Card key={e.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{e.codigo}</div>
                      <div className="text-base font-semibold">{e.nome}</div>
                      <div className="text-xs text-muted-foreground">{e.localizacao ?? e.tipo ?? "—"}</div>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                  {op ? (
                    <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">
                      <div className="font-medium">OP {op.numero}</div>
                      <div className="text-xs text-muted-foreground">
                        {(op.produto as { nome: string } | null)?.nome ?? ""} · há {durationFromNow(op.inicio_em)}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-muted-foreground">Disponível para nova OP.</div>
                  )}
                  <div className="mt-4 flex justify-end gap-2">
                    {op ? (
                      <Button asChild size="sm">
                        <Link to="/producao/$id" params={{ id: op.id }}><Eye className="mr-1 h-4 w-4" />Acompanhar</Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/producao/nova" search={{ equipamento: e.id }}><Play className="mr-1 h-4 w-4" />Abrir OP</Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/cadastros/equipamentos/$id" params={{ id: e.id }}>Histórico</Link>
                    </Button>
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    disponivel: { label: "Disponível", cls: "bg-success/20 text-success border-success/30" },
    ocupado: { label: "Ocupado", cls: "bg-primary/20 text-primary border-primary/30" },
    parado: { label: "Parado", cls: "bg-warning/20 text-warning border-warning/30" },
  };
  const v = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
}
