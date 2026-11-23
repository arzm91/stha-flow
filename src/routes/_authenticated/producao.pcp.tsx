import { indiceCorrigido } from "@/lib/reports-v2/producao-periodo";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Eye, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { RegistrarProducaoManualDialog } from "@/components/producao/RegistrarProducaoManualDialog";

export const Route = createFileRoute("/_authenticated/producao/pcp")({
  head: pageHead({ title: "Produção · Ordens finalizadas — STHApc", description: "Consulte as ordens de produção finalizadas com filtros por período, equipamento e produto.", path: "/producao/pcp" }),
  component: PcpPage,
});

type Row = {
  id: string; numero: string; equipamento_id: string; produto_id: string;
  qtd_produzida: number | null; inicio_em: string | null; fim_em: string | null;
  indice_conversao: number | null; concentracao_media: number | null; responsavel_fechamento: string | null;
  produto: { nome: string; codigo: string; concentracao: number | null } | null;
  equipamento: { nome: string; codigo: string } | null;
  materiais: Array<{ quantidade_consumida: number | null }> | null;
};

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function PcpPage() {
  const qc = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const [de, setDe] = useState(() => localInput(new Date(Date.now() - 30 * 86400_000)));
  const [ate, setAte] = useState(() => localInput(new Date()));
  const [equip, setEquip] = useState("");
  const [prod, setProd] = useState("");
  const [busca, setBusca] = useState("");

  const equipamentos = useQuery({
    queryKey: ["pcp-equipamentos"],
    queryFn: async () => (await supabase.from("equipamentos").select("id,codigo,nome,status").eq("ativo", true).eq("categoria", "producao").order("codigo")).data ?? [],
  });
  const produtos = useQuery({
    queryKey: ["pcp-produtos"],
    queryFn: async () => (await supabase.from("produtos").select("id,codigo,nome").order("nome")).data ?? [],
  });

  const ordens = useQuery({
    queryKey: ["pcp-finalizadas", de, ate, equip, prod],
    queryFn: async () => {
      let q = supabase.from("ordens_producao")
        .select("id,numero,equipamento_id,produto_id,qtd_produzida,inicio_em,fim_em,indice_conversao,concentracao_media,responsavel_fechamento,produto:produto_id(nome,codigo,concentracao),equipamento:equipamento_id(nome,codigo),materiais:ordem_materiais(quantidade_consumida)")
        .eq("status", "finalizada")
        .gte("fim_em", new Date(de).toISOString())
        .lte("fim_em", new Date(ate).toISOString())
        .order("fim_em", { ascending: false })
        .limit(1000);
      if (equip) q = q.eq("equipamento_id", equip);
      if (prod) q = q.eq("produto_id", prod);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (ordens.data ?? []).filter((o) => !b || o.numero?.toLowerCase().includes(b) || (o.responsavel_fechamento ?? "").toLowerCase().includes(b));
  }, [ordens.data, busca]);

  const consumo = (o: Row) => (o.materiais ?? []).reduce((s, m) => s + Number(m.quantidade_consumida ?? 0), 0);
  const indice = (o: Row) => o.indice_conversao ?? indiceCorrigido(consumo(o), Number(o.qtd_produzida ?? 0), o.produto?.concentracao ?? null, o.concentracao_media);

  const totProd = rows.reduce((s, o) => s + Number(o.qtd_produzida ?? 0), 0);
  const totCons = rows.reduce((s, o) => s + consumo(o), 0);
  const pond = rows.reduce((acc, o) => { const i = indice(o); const q = Number(o.qtd_produzida ?? 0); return i != null && q > 0 ? { s: acc.s + i * q, q: acc.q + q } : acc; }, { s: 0, q: 0 });

  const pdf = async (id: string) => {
    try { const { gerarRelatorioProducaoPdf } = await import("@/lib/producao-pdf"); await gerarRelatorioProducaoPdf(id); }
    catch (e) { toast.error("Erro ao gerar relatório: " + (e as Error).message); }
  };

  const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/producao"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link>
      </Button>
      <PageHeader
        title="Ordens finalizadas"
        description="Consulte as produções finalizadas por período, equipamento e produto."
        actions={<Button onClick={() => setManualOpen(true)}><Plus className="mr-2 h-4 w-4" />Registrar produção</Button>}
      />

      <Card className="mb-3">
        <CardContent className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><Label className="text-xs">De</Label><Input type="datetime-local" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <div><Label className="text-xs">Equipamento</Label>
            <select className={sel} value={equip} onChange={(e) => setEquip(e.target.value)}>
              <option value="">Todos</option>
              {(equipamentos.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nome}</option>)}
            </select></div>
          <div><Label className="text-xs">Produto</Label>
            <select className={sel} value={prod} onChange={(e) => setProd(e.target.value)}>
              <option value="">Todos</option>
              {(produtos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select></div>
          <div><Label className="text-xs">Buscar (OP ou responsável)</Label><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: OP-0012" /></div>
        </CardContent>
      </Card>

      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        {[["Ordens", String(rows.length)], ["Total produzido", num(totProd)], ["Total consumido", num(totCons)], ["Índice médio", pond.q > 0 ? num(pond.s / pond.q, 3) : "—"]].map(([l, v]) => (
          <Card key={l}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="font-mono text-xl font-semibold">{v}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>OP</TableHead><TableHead>Equipamento</TableHead><TableHead>Produto</TableHead>
              <TableHead>Início</TableHead><TableHead>Fim</TableHead>
              <TableHead className="text-right">Produzido</TableHead><TableHead className="text-right">Consumido</TableHead>
              <TableHead className="text-right">Índice</TableHead><TableHead>Responsável</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">{ordens.isLoading ? "Carregando..." : "Nenhuma ordem finalizada no filtro."}</TableCell></TableRow>
              ) : rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono">{o.numero}</TableCell>
                  <TableCell>{o.equipamento?.codigo ?? "—"}</TableCell>
                  <TableCell>{o.produto?.nome ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{dt(o.inicio_em)}</TableCell>
                  <TableCell className="whitespace-nowrap">{dt(o.fim_em)}</TableCell>
                  <TableCell className="text-right font-mono">{num(o.qtd_produzida)}</TableCell>
                  <TableCell className="text-right font-mono">{num(consumo(o))}</TableCell>
                  <TableCell className="text-right font-mono">{num(indice(o), 3)}</TableCell>
                  <TableCell>{o.responsavel_fechamento ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button asChild size="icon" variant="ghost" title="Ver detalhes"><Link to="/producao/finalizada/$id" params={{ id: o.id }}><Eye className="h-4 w-4" /></Link></Button>
                    <Button size="icon" variant="ghost" title="Relatório PDF" onClick={() => pdf(o.id)}><FileText className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RegistrarProducaoManualDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        equipamentos={(equipamentos.data ?? []) as never}
        onDone={() => qc.invalidateQueries({ queryKey: ["pcp-finalizadas"] })}
      />
    </div>
  );
}
