import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ArrowLeft } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/relatorios/estoque")({
  component: () => {
    const q = useQuery({
      queryKey: ["rel-est"],
      queryFn: async () => (await supabase.from("movimentacoes_estoque")
        .select("*, produto:produto_id(nome,codigo), tanque:tanque_id(codigo,nome)")
        .order("ocorrido_em", { ascending: false })).data ?? [],
    });
    const rows = q.data ?? [];
    const download = () => {
      const csv = ["Data;Tipo;Produto;Tanque;Quantidade;Origem;Destino"];
      for (const r of rows) csv.push([r.ocorrido_em, r.tipo, (r.produto as any)?.nome ?? "", (r.tanque as any)?.codigo ?? "", r.quantidade, r.origem ?? "", r.destino ?? ""].join(";"));
      const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `estoque_${Date.now()}.csv`; a.click();
    };
    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/relatorios"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link></Button>
        <PageHeader title="Relatório de Estoque" actions={<Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>} />
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Produto</TableHead>
                <TableHead>Tanque</TableHead><TableHead>Quantidade</TableHead><TableHead>Origem/Destino</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow> :
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.ocorrido_em)}</TableCell>
                      <TableCell><Badge variant="outline" className={r.tipo === "entrada" ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30"}>{r.tipo}</Badge></TableCell>
                      <TableCell>{(r.produto as any)?.nome ?? "—"}</TableCell>
                      <TableCell>{(r.tanque as any)?.codigo ?? "—"}</TableCell>
                      <TableCell className="font-mono">{formatNumber(Number(r.quantidade))}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.origem ?? r.destino ?? "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  },
});
