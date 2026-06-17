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
import { formatDate, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function todayISO() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

type Produto = { id: string; nome: string; codigo: string; unidade: string };
type Tanque = { id: string; codigo: string; nome: string };

export const Route = createFileRoute("/_authenticated/relatorios/estoque")({
  component: () => {
    const [de, setDe] = useState(todayISO());
    const [ate, setAte] = useState(todayISO());

    const movsQ = useQuery({
      queryKey: ["rel-est-mov", de, ate],
      queryFn: async () => {
        const start = new Date(de + "T00:00:00").toISOString();
        const end = new Date(ate + "T23:59:59.999").toISOString();
        return (await supabase.from("movimentacoes_estoque")
          .select("*, produto:produto_id(nome,codigo,unidade), tanque:tanque_id(codigo,nome)")
          .gte("ocorrido_em", start).lte("ocorrido_em", end)
          .order("ocorrido_em", { ascending: false })).data ?? [];
      },
    });

    const allMovsQ = useQuery({
      queryKey: ["rel-est-all-mov"],
      queryFn: async () => (await supabase.from("movimentacoes_estoque")
        .select("produto_id,tipo,quantidade")).data ?? [],
    });

    const produtosQ = useQuery({
      queryKey: ["rel-est-prod"],
      queryFn: async () => (await supabase.from("produtos").select("id,nome,codigo,unidade")).data ?? [],
    });

    const opsEmAndamentoQ = useQuery({
      queryKey: ["rel-est-op-andamento"],
      queryFn: async () => (await supabase.from("ordens_producao")
        .select("*, produto:produto_id(id,nome,codigo,unidade), equipamento:equipamento_id(nome,codigo), tanque_destino:tanque_destino_id(codigo,nome)")
        .eq("status", "em_andamento")
        .order("inicio_em", { ascending: false })).data ?? [],
    });

    const movs = movsQ.data ?? [];
    const allMovs = allMovsQ.data ?? [];
    const produtos = (produtosQ.data ?? []) as Produto[];
    const ops = opsEmAndamentoQ.data ?? [];

    const estoqueAtual = useMemo(() => {
      const map = new Map<string, number>();
      for (const m of allMovs) {
        const q = Number(m.quantidade) || 0;
        const cur = map.get(m.produto_id) ?? 0;
        map.set(m.produto_id, cur + (m.tipo === "entrada" ? q : -q));
      }
      return produtos.map((p) => ({ ...p, saldo: map.get(p.id) ?? 0 }));
    }, [allMovs, produtos]);

    const estoqueFuturo = useMemo(() => {
      const adicionar = new Map<string, number>();
      for (const o of ops) {
        const pid = (o.produto as Produto | null)?.id ?? o.produto_id;
        if (!pid) continue;
        const restante = (Number(o.qtd_planejada) || 0) - (Number(o.qtd_produzida) || 0);
        adicionar.set(pid, (adicionar.get(pid) ?? 0) + Math.max(restante, 0));
      }
      return estoqueAtual.map((p) => ({ ...p, futuro: p.saldo + (adicionar.get(p.id) ?? 0) }));
    }, [estoqueAtual, ops]);

    const totaisMov = useMemo(() => {
      let entradas = 0, saidas = 0;
      for (const m of movs) {
        const q = Number(m.quantidade) || 0;
        if (m.tipo === "entrada") entradas += q; else saidas += q;
      }
      return { entradas, saidas, count: movs.length };
    }, [movs]);

    const gerarPDF = () => {
      const doc = new jsPDF();
      const w = doc.internal.pageSize.getWidth();
      doc.setFontSize(16); doc.text("Relatório de Estoque", w / 2, 15, { align: "center" });
      doc.setFontSize(10);
      doc.text(`Período: ${new Date(de).toLocaleDateString("pt-BR")} a ${new Date(ate).toLocaleDateString("pt-BR")}`, w / 2, 22, { align: "center" });
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, w / 2, 28, { align: "center" });

      doc.setFontSize(12); doc.text("Resumo do período", 14, 38);
      autoTable(doc, {
        startY: 41,
        head: [["Indicador", "Valor"]],
        body: [
          ["Movimentações", String(totaisMov.count)],
          ["Entradas (total)", formatNumber(totaisMov.entradas)],
          ["Saídas (total)", formatNumber(totaisMov.saidas)],
          ["Saldo líquido", formatNumber(totaisMov.entradas - totaisMov.saidas)],
        ],
        styles: { fontSize: 9 }, headStyles: { fillColor: [30, 41, 59] },
      });

      let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setFontSize(12); doc.text("Movimentações do período", 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [["Data", "Tipo", "Produto", "Tanque", "Quantidade", "Origem/Destino"]],
        body: movs.map((r) => [
          formatDate(r.ocorrido_em),
          r.tipo,
          (r.produto as { nome?: string } | null)?.nome ?? "—",
          (r.tanque as { codigo?: string } | null)?.codigo ?? "—",
          formatNumber(Number(r.quantidade)),
          r.origem ?? r.destino ?? "—",
        ]),
        styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setFontSize(12); doc.text("Estoque atual", 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [["Código", "Produto", "Unidade", "Saldo atual"]],
        body: estoqueAtual.map((p) => [p.codigo, p.nome, p.unidade, formatNumber(p.saldo)]),
        styles: { fontSize: 9 }, headStyles: { fillColor: [30, 41, 59] },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setFontSize(12); doc.text("Reatores em produção", 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [["Equipamento", "Produto", "Tanque destino", "Início", "Planejado", "Produzido", "Restante"]],
        body: ops.map((o) => {
          const restante = Math.max((Number(o.qtd_planejada) || 0) - (Number(o.qtd_produzida) || 0), 0);
          return [
            (o.equipamento as { nome?: string } | null)?.nome ?? "—",
            (o.produto as { nome?: string } | null)?.nome ?? "—",
            (o.tanque_destino as { codigo?: string } | null)?.codigo ?? "—",
            formatDate(o.inicio_em),
            formatNumber(Number(o.qtd_planejada)),
            formatNumber(Number(o.qtd_produzida) || 0),
            formatNumber(restante),
          ];
        }),
        styles: { fontSize: 9 }, headStyles: { fillColor: [30, 41, 59] },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setFontSize(12); doc.text("Estoque projetado (após produções em andamento)", 14, y);
      autoTable(doc, {
        startY: y + 3,
        head: [["Código", "Produto", "Unidade", "Atual", "A produzir", "Projetado"]],
        body: estoqueFuturo.map((p) => [
          p.codigo, p.nome, p.unidade,
          formatNumber(p.saldo),
          formatNumber(p.futuro - p.saldo),
          formatNumber(p.futuro),
        ]),
        styles: { fontSize: 9 }, headStyles: { fillColor: [30, 41, 59] },
      });

      doc.save(`estoque_${de}_${ate}.pdf`);
    };

    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/relatorios"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link></Button>
        <PageHeader title="Relatório de Estoque" actions={<Button onClick={gerarPDF}><FileDown className="mr-2 h-4 w-4" />Gerar PDF</Button>} />

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
            { label: "Movimentações", value: String(totaisMov.count) },
            { label: "Entradas", value: formatNumber(totaisMov.entradas) },
            { label: "Saídas", value: formatNumber(totaisMov.saidas) },
            { label: "Reatores em produção", value: String(ops.length) },
          ].map((k) => (
            <Card key={k.label}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-2xl font-semibold">{k.value}</div>
            </CardContent></Card>
          ))}
        </div>

        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="border-b px-4 py-2 text-sm font-semibold">Movimentações do período</div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Produto</TableHead>
                <TableHead>Tanque</TableHead><TableHead>Quantidade</TableHead><TableHead>Origem/Destino</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {movs.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem movimentações no período</TableCell></TableRow> :
                  movs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.ocorrido_em)}</TableCell>
                      <TableCell><Badge variant="outline" className={r.tipo === "entrada" ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30"}>{r.tipo}</Badge></TableCell>
                      <TableCell>{(r.produto as { nome?: string } | null)?.nome ?? "—"}</TableCell>
                      <TableCell>{(r.tanque as { codigo?: string } | null)?.codigo ?? "—"}</TableCell>
                      <TableCell className="font-mono">{formatNumber(Number(r.quantidade))}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.origem ?? r.destino ?? "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="border-b px-4 py-2 text-sm font-semibold">Reatores em produção</div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Equipamento</TableHead><TableHead>Produto</TableHead><TableHead>Tanque destino</TableHead>
                <TableHead>Início</TableHead><TableHead>Planejado</TableHead><TableHead>Produzido</TableHead><TableHead>Restante</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ops.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma produção em andamento</TableCell></TableRow> :
                  ops.map((o) => {
                    const restante = Math.max((Number(o.qtd_planejada) || 0) - (Number(o.qtd_produzida) || 0), 0);
                    return (
                      <TableRow key={o.id}>
                        <TableCell>{(o.equipamento as { nome?: string } | null)?.nome ?? "—"}</TableCell>
                        <TableCell>{(o.produto as { nome?: string } | null)?.nome ?? "—"}</TableCell>
                        <TableCell>{(o.tanque_destino as { codigo?: string } | null)?.codigo ?? "—"}</TableCell>
                        <TableCell>{formatDate(o.inicio_em)}</TableCell>
                        <TableCell className="font-mono">{formatNumber(Number(o.qtd_planejada))}</TableCell>
                        <TableCell className="font-mono">{formatNumber(Number(o.qtd_produzida) || 0)}</TableCell>
                        <TableCell className="font-mono">{formatNumber(restante)}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-2 text-sm font-semibold">Estoque atual e projetado</div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Código</TableHead><TableHead>Produto</TableHead><TableHead>Unidade</TableHead>
                <TableHead>Atual</TableHead><TableHead>A produzir</TableHead><TableHead>Projetado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {estoqueFuturo.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum produto cadastrado</TableCell></TableRow> :
                  estoqueFuturo.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono">{p.codigo}</TableCell>
                      <TableCell>{p.nome}</TableCell>
                      <TableCell>{p.unidade}</TableCell>
                      <TableCell className="font-mono">{formatNumber(p.saldo)}</TableCell>
                      <TableCell className="font-mono">{formatNumber(p.futuro - p.saldo)}</TableCell>
                      <TableCell className="font-mono font-semibold">{formatNumber(p.futuro)}</TableCell>
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
