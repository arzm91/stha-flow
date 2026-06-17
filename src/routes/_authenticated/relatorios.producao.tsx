import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ArrowLeft } from "lucide-react";
import { formatDate, formatNumber, durationBetween } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/relatorios/producao")({
  component: () => {
    const q = useQuery({
      queryKey: ["rel-prod"],
      queryFn: async () => (await supabase.from("ordens_producao")
        .select("*, produto:produto_id(nome,codigo), equipamento:equipamento_id(nome,codigo)")
        .order("inicio_em", { ascending: false })).data ?? [],
    });
    const rows = q.data ?? [];
    const download = () => {
      const csv = ["Numero;Produto;Equipamento;Inicio;Fim;Qtd Planejada;Qtd Produzida;Status"];
      for (const r of rows) {
        csv.push([
          r.numero,
          (r.produto as any)?.nome ?? "",
          (r.equipamento as any)?.nome ?? "",
          r.inicio_em ?? "",
          r.fim_em ?? "",
          r.qtd_planejada, r.qtd_produzida ?? "", r.status,
        ].join(";"));
      }
      const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `producao_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    };
    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/relatorios"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link></Button>
        <PageHeader title="Relatório de Produção" actions={<Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>} />
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ordem</TableHead><TableHead>Produto</TableHead><TableHead>Equipamento</TableHead>
                <TableHead>Início</TableHead><TableHead>Fim</TableHead><TableHead>Tempo</TableHead>
                <TableHead>Planejado</TableHead><TableHead>Produzido</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow> :
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.numero}</TableCell>
                      <TableCell>{(r.produto as any)?.nome ?? "—"}</TableCell>
                      <TableCell>{(r.equipamento as any)?.nome ?? "—"}</TableCell>
                      <TableCell>{formatDate(r.inicio_em)}</TableCell>
                      <TableCell>{r.fim_em ? formatDate(r.fim_em) : "—"}</TableCell>
                      <TableCell>{r.fim_em ? durationBetween(r.inicio_em, r.fim_em) : "—"}</TableCell>
                      <TableCell className="font-mono">{formatNumber(Number(r.qtd_planejada))}</TableCell>
                      <TableCell className="font-mono">{r.qtd_produzida != null ? formatNumber(Number(r.qtd_produzida)) : "—"}</TableCell>
                      <TableCell><Badge variant="outline">{r.status === "em_andamento" ? "Em andamento" : "Finalizada"}</Badge></TableCell>
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
