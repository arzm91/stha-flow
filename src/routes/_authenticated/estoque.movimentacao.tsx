import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/format";
import { gerarRelatorioMovimentacaoPdf } from "@/lib/movimentacao-pdf";

export const Route = createFileRoute("/_authenticated/estoque/movimentacao")({
  head: pageHead({ title: "Estoque · Movimentação — STHApc", description: "Acesse e gerencie Estoque · Movimentação no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: "/estoque/movimentacao" }),
  component: MovimentacaoPage,
});

function MovimentacaoPage() {
  const qc = useQueryClient();
  const produtos = useQuery({ queryKey: ["produtos"], queryFn: async () => (await supabase.from("produtos").select("id,codigo,nome").order("nome")).data ?? [] });
  const tanques = useQuery({ queryKey: ["tanques"], queryFn: async () => (await supabase.from("tanques").select("id,codigo,nome,unidade").order("codigo")).data ?? [] });
  const historico = useQuery({
    queryKey: ["mov-hist"],
    queryFn: async () => (await supabase.from("movimentacoes_estoque")
      .select("*, produto:produto_id(nome,codigo), tanque:tanque_id(codigo,nome,unidade)")
      .order("ocorrido_em", { ascending: false }).limit(100)).data ?? [],
  });

  const submit = async (payload: Record<string, unknown>, ctx: {
    tipo: "entrada" | "saida"; expedicao?: boolean;
    produto?: { codigo: string; nome: string };
    tanque?: { codigo: string; nome: string; unidade?: string | null };
    quantidade: number; origem?: string | null; destino?: string | null;
  }) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Não autenticado");
    const ocorridoEm = new Date().toISOString();
    const { error } = await supabase.from("movimentacoes_estoque").insert({ ...payload, owner_id: u.user.id, ocorrido_em: ocorridoEm } as never);
    if (error) throw error;
    qc.invalidateQueries();

    // Gera PDF para saída e expedição
    if (ctx.tipo === "saida") {
      let analises: Awaited<ReturnType<typeof carregarAnalisesTanque>> = [];
      if ((payload as any).tanque_id) {
        try { analises = await carregarAnalisesTanque((payload as any).tanque_id as string); } catch { /* ignore */ }
      }
      const responsavel = u.user.email ?? null;
      gerarRelatorioMovimentacaoPdf({
        tipo: "saida",
        expedicao: ctx.expedicao,
        produto: ctx.produto,
        tanqueOrigem: ctx.tanque,
        quantidade: ctx.quantidade,
        unidade: ctx.tanque?.unidade ?? null,
        origem: ctx.origem ?? null,
        destino: ctx.destino ?? null,
        ocorridoEm,
        responsavel,
        analises,
      });
    }
  };

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/estoque"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link>
      </Button>
      <PageHeader title="Movimentação de Estoque" description="Registre entradas, saídas e expedições. Saídas e expedições geram automaticamente um relatório em PDF." />

      <Tabs defaultValue="entrada">
        <TabsList>
          <TabsTrigger value="entrada"><ArrowDownToLine className="mr-1 h-4 w-4" />Entrada</TabsTrigger>
          <TabsTrigger value="saida"><ArrowUpFromLine className="mr-1 h-4 w-4" />Saída</TabsTrigger>
          <TabsTrigger value="expedicao"><Truck className="mr-1 h-4 w-4" />Expedição</TabsTrigger>
        </TabsList>
        <TabsContent value="entrada"><MovForm tipo="entrada" produtos={produtos.data ?? []} tanques={tanques.data ?? []} onSubmit={submit} /></TabsContent>
        <TabsContent value="saida"><MovForm tipo="saida" produtos={produtos.data ?? []} tanques={tanques.data ?? []} onSubmit={submit} /></TabsContent>
        <TabsContent value="expedicao"><MovForm tipo="saida" expedicao produtos={produtos.data ?? []} tanques={tanques.data ?? []} onSubmit={submit} /></TabsContent>
      </Tabs>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Histórico recente</CardTitle></CardHeader>
        <CardContent>
          {(historico.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem movimentações.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead><TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead><TableHead>Tanque</TableHead>
                  <TableHead>Quantidade</TableHead><TableHead>Origem/Destino</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.data!.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDate(m.ocorrido_em)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={m.tipo === "entrada" ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30"}>
                        {m.tipo === "entrada" ? "Entrada" : "Saída"}
                      </Badge>
                    </TableCell>
                    <TableCell>{(m.produto as any)?.nome ?? "—"}</TableCell>
                    <TableCell>{(m.tanque as any)?.codigo ?? "—"}</TableCell>
                    <TableCell className="font-mono">{formatNumber(Number(m.quantidade))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.origem ?? m.destino ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {m.tipo === "saida" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const analises = (m.tanque_id ? await carregarAnalisesTanque(m.tanque_id as string) : []);
                            gerarRelatorioMovimentacaoPdf({
                              tipo: "saida",
                              produto: m.produto as any,
                              tanqueOrigem: m.tanque as any,
                              quantidade: Number(m.quantidade),
                              unidade: (m.tanque as any)?.unidade ?? null,
                              origem: m.origem,
                              destino: m.destino,
                              ocorridoEm: m.ocorrido_em,
                              analises,
                            });
                          }}
                        >
                          Gerar PDF
                        </Button>
                      )}
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

async function carregarAnalisesTanque(tanqueId: string) {
  const { data } = await supabase
    .from("tanque_analises")
    .select("resultado,observacao,registrado_em, analise:analise_id(nome,unidade,valor_min,valor_max)")
    .eq("tanque_id", tanqueId)
    .order("registrado_em", { ascending: false })
    .limit(20);
  return (data ?? []).map((a: any) => ({
    nome: a.analise?.nome ?? "—",
    unidade: a.analise?.unidade ?? null,
    resultado: Number(a.resultado),
    valor_min: a.analise?.valor_min ?? null,
    valor_max: a.analise?.valor_max ?? null,
    registrado_em: a.registrado_em,
    observacao: a.observacao ?? null,
  }));
}

function MovForm({
  tipo, expedicao, produtos, tanques, onSubmit,
}: {
  tipo: "entrada" | "saida"; expedicao?: boolean;
  produtos: { id: string; codigo: string; nome: string }[];
  tanques: { id: string; codigo: string; nome: string; unidade?: string | null }[];
  onSubmit: (
    payload: Record<string, unknown>,
    ctx: {
      tipo: "entrada" | "saida"; expedicao?: boolean;
      produto?: { codigo: string; nome: string };
      tanque?: { codigo: string; nome: string; unidade?: string | null };
      quantidade: number; origem?: string | null; destino?: string | null;
    },
  ) => Promise<void>;
}) {
  const [produtoId, setProdutoId] = useState("");
  const [tanqueId, setTanqueId] = useState("");
  const [quantidade, setQuantidade] = useState<number | "">("");
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => { setProdutoId(""); setTanqueId(""); setQuantidade(""); setExtra(""); };

  return (
    <Card className="mt-4 max-w-2xl">
      <CardContent className="p-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!produtoId || quantidade === "" || Number(quantidade) <= 0) return toast.error("Preencha produto e quantidade");
            if (tipo === "saida" && !tanqueId) return toast.error("Selecione o tanque de origem para gerar o relatório");
            setLoading(true);
            try {
              const produto = produtos.find((p) => p.id === produtoId);
              const tanque = tanques.find((t) => t.id === tanqueId);
              await onSubmit(
                {
                  tipo, produto_id: produtoId, tanque_id: tanqueId || null,
                  quantidade: Number(quantidade),
                  ...(tipo === "entrada" ? { origem: extra || null } : { destino: extra || null }),
                },
                {
                  tipo, expedicao,
                  produto: produto ? { codigo: produto.codigo, nome: produto.nome } : undefined,
                  tanque: tanque ? { codigo: tanque.codigo, nome: tanque.nome, unidade: tanque.unidade } : undefined,
                  quantidade: Number(quantidade),
                  origem: tipo === "entrada" ? extra || null : null,
                  destino: tipo === "saida" ? extra || null : null,
                },
              );
              toast.success(tipo === "saida" ? "Movimentação registrada — gerando relatório" : "Movimentação registrada");
              reset();
            } catch (err) { toast.error((err as Error).message); }
            finally { setLoading(false); }
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Produto</Label>
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— selecione —</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Tanque {tipo === "saida" ? "de origem" : ""}</Label>
              <select value={tanqueId} onChange={(e) => setTanqueId(e.target.value)} required={tipo === "saida"}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— {tipo === "saida" ? "selecione" : "nenhum"} —</option>
                {tanques.map((t) => <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input type="number" step="any" value={quantidade} onChange={(e) => setQuantidade(e.target.value === "" ? "" : Number(e.target.value))} required />
            </div>
            <div className="space-y-1.5">
              <Label>{tipo === "entrada" ? "Origem" : (expedicao ? "Destino / Cliente" : "Destino")}</Label>
              <Input value={extra} onChange={(e) => setExtra(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>Registrar {tipo === "entrada" ? "Entrada" : expedicao ? "Expedição" : "Saída"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
