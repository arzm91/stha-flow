import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileDown, ArrowLeft } from "lucide-react";
import { formatDate, formatNumber, durationBetween, formatDuration } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/_authenticated/relatorios/producao")({
  component: () => {
    const [de, setDe] = useState(todayISO());
    const [ate, setAte] = useState(todayISO());

    const q = useQuery({
      queryKey: ["rel-prod", de, ate],
      queryFn: async () => {
        const start = new Date(de + "T00:00:00").toISOString();
        const end = new Date(ate + "T23:59:59.999").toISOString();
        return (await supabase.from("ordens_producao")
          .select("*, produto:produto_id(nome,codigo,unidade), equipamento:equipamento_id(nome,codigo)")
          .gte("inicio_em", start)
          .lte("inicio_em", end)
          .order("inicio_em", { ascending: false })).data ?? [];
      },
    });
    const rows = q.data ?? [];

    const indicadores = useMemo(() => {
      const total = rows.length;
      const finalizadas = rows.filter((r) => r.status === "finalizada").length;
      const emAndamento = rows.filter((r) => r.status === "em_andamento").length;
      let planejado = 0, produzido = 0, tempoMs = 0, tempoCount = 0;
      for (const r of rows) {
        planejado += Number(r.qtd_planejada) || 0;
        produzido += Number(r.qtd_produzida) || 0;
        if (r.fim_em) {
          tempoMs += new Date(r.fim_em).getTime() - new Date(r.inicio_em).getTime();
          tempoCount++;
        }
      }
      const eficiencia = planejado > 0 ? (produzido / planejado) * 100 : 0;
      return { total, finalizadas, emAndamento, planejado, produzido, eficiencia, tempoMedio: tempoCount ? tempoMs / tempoCount : null };
    }, [rows]);

    const gerarPDF = () => {
      const doc = new jsPDF();
      const w = doc.internal.pageSize.getWidth();
      doc.setFontSize(16); doc.text("Relatório de Produção", w / 2, 15, { align: "center" });
      doc.setFontSize(10);
      doc.text(`Período: ${new Date(de).toLocaleDateString("pt-BR")} a ${new Date(ate).toLocaleDateString("pt-BR")}`, w / 2, 22, { align: "center" });
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, w / 2, 28, { align: "center" });

      doc.setFontSize(12); doc.text("Indicadores", 14, 38);
      autoTable(doc, {
        startY: 41,
        head: [["Indicador", "Valor"]],
        body: [
          ["Total de ordens", String(indicadores.total)],
          ["Finalizadas", String(indicadores.finalizadas)],
          ["Em andamento", String(indicadores.emAndamento)],
          ["Qtd. planejada", formatNumber(indicadores.planejado)],
          ["Qtd. produzida", formatNumber(indicadores.produzido)],
          ["Eficiência", `${indicadores.eficiencia.toFixed(1)}%`],
          ["Tempo médio (finalizadas)", indicadores.tempoMedio != null ? formatDuration(indicadores.tempoMedio) : "—"],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setFontSize(12); doc.text("Ordens de Produção", 14, lastY);
      autoTable(doc, {
        startY: lastY + 3,
        head: [["Ordem", "Produto", "Equipamento", "Início", "Fim", "Tempo", "Planejado", "Produzido", "Status"]],
        body: rows.map((r) => [
          r.numero,
          (r.produto as { nome?: string } | null)?.nome ?? "—",
          (r.equipamento as { nome?: string } | null)?.nome ?? "—",
          formatDate(r.inicio_em),
          r.fim_em ? formatDate(r.fim_em) : "—",
          r.fim_em ? durationBetween(r.inicio_em, r.fim_em) : "—",
          formatNumber(Number(r.qtd_planejada)),
          r.qtd_produzida != null ? formatNumber(Number(r.qtd_produzida)) : "—",
          r.status === "em_andamento" ? "Em andamento" : "Finalizada",
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      doc.save(`producao_${de}_${ate}.pdf`);
    };

    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/relatorios"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link></Button>
        <PageHeader title="Relatório de Produção" actions={<Button onClick={gerarPDF}><FileDown className="mr-2 h-4 w-4" />Gerar PDF</Button>} />

        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="grid gap-1">
              <Label htmlFor="de">De</Label>
              <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-44" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { const t = todayISO(); setDe(t); setAte(t); }}>Hoje</Button>
              <Button variant="outline" size="sm" onClick={() => {
                const d = new Date(); const start = new Date(d); start.setDate(d.getDate() - 7);
                setDe(start.toISOString().slice(0, 10)); setAte(d.toISOString().slice(0, 10));
              }}>Últimos 7 dias</Button>
              <Button variant="outline" size="sm" onClick={() => {
                const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), 1);
                setDe(start.toISOString().slice(0, 10)); setAte(d.toISOString().slice(0, 10));
              }}>Mês atual</Button>
            </div>
          </CardContent>
        </Card>

        <div className="mb-4 grid gap-3 md:grid-cols-4">
          {[
            { label: "Ordens no período", value: String(indicadores.total) },
            { label: "Finalizadas", value: String(indicadores.finalizadas) },
            { label: "Produzido", value: formatNumber(indicadores.produzido) },
            { label: "Eficiência", value: `${indicadores.eficiencia.toFixed(1)}%` },
          ].map((k) => (
            <Card key={k.label}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-2xl font-semibold">{k.value}</div>
            </CardContent></Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ordem</TableHead><TableHead>Produto</TableHead><TableHead>Equipamento</TableHead>
                <TableHead>Início</TableHead><TableHead>Fim</TableHead><TableHead>Tempo</TableHead>
                <TableHead>Planejado</TableHead><TableHead>Produzido</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sem dados no período</TableCell></TableRow> :
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.numero}</TableCell>
                      <TableCell>{(r.produto as { nome?: string } | null)?.nome ?? "—"}</TableCell>
                      <TableCell>{(r.equipamento as { nome?: string } | null)?.nome ?? "—"}</TableCell>
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
