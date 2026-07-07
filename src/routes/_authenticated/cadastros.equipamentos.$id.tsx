import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber, durationBetween, durationFromNow } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/cadastros/equipamentos/$id")({
  head: pageHead({ title: "Cadastros · Equipamentos · Detalhes — STHApc", description: "Visualize detalhes no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: (params) => `/cadastros/equipamentos/${params.id}` }),
  component: EquipDetail,
});

function EquipDetail() {
  const { id } = Route.useParams();
  const equip = useQuery({
    queryKey: ["equipamento", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const ops = useQuery({
    queryKey: ["equipamento-ops", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_producao")
        .select("id,numero,status,inicio_em,fim_em,qtd_produzida,qtd_planejada,produto:produto_id(nome)")
        .eq("equipamento_id", id)
        .order("inicio_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/cadastros/equipamentos"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
      </Button>
      <PageHeader title={equip.data?.nome ?? "Equipamento"} description={equip.data ? `Código ${equip.data.codigo} · ${equip.data.tipo ?? "—"}` : ""} />

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de produções</CardTitle></CardHeader>
        <CardContent>
          {(ops.data ?? []).length === 0 ? (
            <EmptyState title="Sem produções registradas" description="As ordens de produção feitas neste equipamento aparecerão aqui." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead>Qtd. produzida</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ops.data!.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.numero}</TableCell>
                    <TableCell>{(o.produto as { nome: string } | null)?.nome ?? "—"}</TableCell>
                    <TableCell>{o.inicio_em ? formatDate(o.inicio_em) : "—"}</TableCell>
                    <TableCell>{o.fim_em ? formatDate(o.fim_em) : "—"}</TableCell>
                    <TableCell>{o.inicio_em ? (o.fim_em ? durationBetween(o.inicio_em, o.fim_em) : durationFromNow(o.inicio_em)) : "—"}</TableCell>
                    <TableCell>{formatNumber(o.qtd_produzida ?? 0)}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/producao/$id" params={{ id: o.id }}>Abrir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
