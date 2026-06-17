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

export const Route = createFileRoute("/_authenticated/relatorios/qualidade")({
  component: () => {
    const q = useQuery({
      queryKey: ["rel-qual"],
      queryFn: async () => (await supabase.from("analises_registradas")
        .select("*, analise:analise_id(nome,unidade,valor_min,valor_max), ordem:ordem_id(numero)")
        .order("registrado_em", { ascending: false })).data ?? [],
    });
    const rows = q.data ?? [];

    const status = (r: any) => {
      const ref = r.analise as { valor_min: number | null; valor_max: number | null } | null;
      if (!ref) return null;
      const v = Number(r.resultado);
      const min = ref.valor_min != null ? Number(ref.valor_min) : null;
      const max = ref.valor_max != null ? Number(ref.valor_max) : null;
      if ((min != null && v < min) || (max != null && v > max)) return "fora";
      return "ok";
    };

    const download = () => {
      const csv = ["Data;OP;Analise;Resultado;Unidade;Status"];
      for (const r of rows) csv.push([r.registrado_em, (r.ordem as any)?.numero ?? "", (r.analise as any)?.nome ?? "", r.resultado, (r.analise as any)?.unidade ?? "", status(r) ?? ""].join(";"));
      const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `qualidade_${Date.now()}.csv`; a.click();
    };

    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/relatorios"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link></Button>
        <PageHeader title="Relatório de Qualidade" actions={<Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>} />
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>OP</TableHead><TableHead>Análise</TableHead>
                <TableHead>Resultado</TableHead><TableHead>Faixa</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow> :
                  rows.map((r) => {
                    const st = status(r);
                    const ref = r.analise as any;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{formatDate(r.registrado_em)}</TableCell>
                        <TableCell className="font-mono">{(r.ordem as any)?.numero ?? "—"}</TableCell>
                        <TableCell>{ref?.nome ?? "—"}</TableCell>
                        <TableCell className="font-mono">{formatNumber(Number(r.resultado))}{ref?.unidade ? ` ${ref.unidade}` : ""}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ref?.valor_min != null || ref?.valor_max != null ? `${ref?.valor_min ?? "—"} ↔ ${ref?.valor_max ?? "—"}` : "—"}
                        </TableCell>
                        <TableCell>{st === "fora" ? <Badge className="bg-destructive/20 text-destructive border-destructive/30" variant="outline">Fora</Badge> : st === "ok" ? <Badge className="bg-success/20 text-success border-success/30" variant="outline">Ok</Badge> : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  },
});
