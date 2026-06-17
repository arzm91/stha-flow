import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/estoque/tanques/$id")({
  component: TanqueDetail,
});

function TanqueDetail() {
  const { id } = Route.useParams();
  const tanque = useQuery({
    queryKey: ["tanque", id],
    queryFn: async () => (await supabase.from("tanques").select("*, produto:produto_id(nome,codigo)").eq("id", id).maybeSingle()).data,
  });
  const mov = useQuery({
    queryKey: ["tanque-mov", id],
    queryFn: async () => (await supabase.from("movimentacoes_estoque")
      .select("*, produto:produto_id(nome,codigo)")
      .eq("tanque_id", id).order("ocorrido_em", { ascending: false })).data ?? [],
  });

  const saldo = (mov.data ?? []).reduce(
    (s, m) => s + (m.tipo === "entrada" ? Number(m.quantidade) : -Number(m.quantidade)),
    0,
  );

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/estoque"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link>
      </Button>
      <PageHeader
        title={tanque.data?.nome ?? "Tanque"}
        description={tanque.data ? `Código ${tanque.data.codigo}` : ""}
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-3 gap-4 p-4">
          <div>
            <div className="text-xs text-muted-foreground">Saldo atual</div>
            <div className="font-mono text-2xl font-semibold text-primary">{formatNumber(saldo)}{tanque.data?.unidade ? ` ${tanque.data.unidade}` : ""}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Capacidade</div>
            <div className="font-mono text-base">{tanque.data?.capacidade ? formatNumber(Number(tanque.data.capacidade)) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Produto vinculado</div>
            <div className="text-base">{(tanque.data?.produto as any)?.nome ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de movimentações</CardTitle></CardHeader>
        <CardContent>
          {(mov.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem movimentações.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Origem/Destino</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mov.data!.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDate(m.ocorrido_em)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={m.tipo === "entrada" ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30"}>
                        {m.tipo === "entrada" ? "Entrada" : "Saída"}
                      </Badge>
                    </TableCell>
                    <TableCell>{(m.produto as any)?.nome ?? "—"}</TableCell>
                    <TableCell className="font-mono">{formatNumber(Number(m.quantidade))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.origem ?? m.destino ?? "—"}</TableCell>
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
