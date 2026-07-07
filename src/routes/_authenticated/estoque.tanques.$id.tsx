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
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, FlaskConical, Trash2, SlidersHorizontal } from "lucide-react";
import { TanqueAjusteDialog } from "@/components/TanqueAjusteDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/estoque/tanques/$id")({
  head: pageHead({ title: "Estoque · Tanques · Detalhes — STHApc", description: "Visualize detalhes no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: (params) => `/estoque/tanques/${params.id}` }),
  component: TanqueDetail,
});

function TanqueDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
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
  const analises = useQuery({
    queryKey: ["tanque-analises", id],
    queryFn: async () => (await supabase.from("tanque_analises")
      .select("*, analise:analise_id(nome,unidade,valor_min,valor_max)")
      .eq("tanque_id", id).order("registrado_em", { ascending: false })).data ?? [],
  });
  const cadastros = useQuery({
    queryKey: ["analises-cadastro"],
    queryFn: async () => (await supabase.from("analises_cadastro").select("id,nome,unidade,valor_min,valor_max").order("nome")).data ?? [],
  });
  const ajustes = useQuery({
    queryKey: ["tanque-ajustes-detail", id],
    queryFn: async () => (await supabase.from("tanque_ajustes_saldo")
      .select("id,saldo,ajustado_em,observacao,produto:produto_id(nome,codigo)")
      .eq("tanque_id", id).order("ajustado_em", { ascending: false })).data ?? [],
  });

  const ultimoAjuste = (ajustes.data ?? [])[0];
  const baselineTs = ultimoAjuste ? new Date(ultimoAjuste.ajustado_em).getTime() : null;
  const baseline = ultimoAjuste ? Number(ultimoAjuste.saldo) : 0;
  const saldo = (mov.data ?? []).reduce((s, m) => {
    if (baselineTs != null && new Date(m.ocorrido_em).getTime() <= baselineTs) return s;
    return s + (m.tipo === "entrada" ? Number(m.quantidade) : -Number(m.quantidade));
  }, baseline);

  const [ajusteOpen, setAjusteOpen] = useState(false);

  const [open, setOpen] = useState(false);
  const [analiseId, setAnaliseId] = useState("");
  const [resultado, setResultado] = useState<number | "">("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  const submitAnalise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analiseId || resultado === "") return toast.error("Selecione a análise e informe o resultado");
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const { error } = await supabase.from("tanque_analises").insert({
        owner_id: u.user.id, tanque_id: id, analise_id: analiseId,
        resultado: Number(resultado), observacao: observacao || null,
      } as never);
      if (error) throw error;
      toast.success("Análise registrada");
      setOpen(false); setAnaliseId(""); setResultado(""); setObservacao("");
      qc.invalidateQueries({ queryKey: ["tanque-analises", id] });
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const remover = async (rid: string) => {
    if (!confirm("Remover esta análise?")) return;
    const { requireAdminPassword } = await import("@/components/admin-password/AdminPasswordGate");
    if (!(await requireAdminPassword("excluir esta análise do tanque"))) return;
    const { error } = await supabase.from("tanque_analises").delete().eq("id", rid);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tanque-analises", id] });
  };

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/estoque"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link>
      </Button>
      <PageHeader
        title={tanque.data?.nome ?? "Tanque"}
        description={tanque.data ? `Código ${tanque.data.codigo}` : ""}
        actions={
          <Button size="sm" onClick={() => setAjusteOpen(true)}>
            <SlidersHorizontal className="mr-1 h-4 w-4" />Ajuste diário
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-4 gap-4 p-4">
          <div>
            <div className="text-xs text-muted-foreground">Saldo atual</div>
            <div className="font-mono text-2xl font-semibold text-primary">{formatNumber(saldo)}{tanque.data?.unidade ? ` ${tanque.data.unidade}` : ""}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Capacidade</div>
            <div className="font-mono text-base">{tanque.data?.capacidade ? formatNumber(Number(tanque.data.capacidade)) : "—"}</div>
            <div className="text-[11px] text-muted-foreground">
              {tanque.data?.capacidade
                ? `${((saldo / Number(tanque.data.capacidade)) * 100).toFixed(1)}% ocupado`
                : ""}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Produto vinculado</div>
            <div className="text-base">{(tanque.data?.produto as any)?.nome ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Último ajuste</div>
            <div className="text-sm">
              {ultimoAjuste
                ? <>{formatDate(ultimoAjuste.ajustado_em)}<div className="text-[11px] text-muted-foreground">Baseline {formatNumber(Number(ultimoAjuste.saldo))}</div></>
                : <span className="text-muted-foreground">Sem ajustes</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <TanqueAjusteDialog
        open={ajusteOpen}
        onOpenChange={setAjusteOpen}
        tanque={tanque.data ? {
          id: tanque.data.id,
          codigo: tanque.data.codigo,
          nome: tanque.data.nome,
          unidade: tanque.data.unidade,
          capacidade: tanque.data.capacidade,
          produto_id: tanque.data.produto_id,
        } : null}
        saldoAtual={saldo}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["tanque", id] });
          qc.invalidateQueries({ queryKey: ["tanque-ajustes-detail", id] });
        }}
      />


      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" />Análises de qualidade do produto armazenado</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm">Nova análise</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar análise de qualidade</DialogTitle></DialogHeader>
              <form onSubmit={submitAnalise} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Análise</Label>
                  <select value={analiseId} onChange={(e) => setAnaliseId(e.target.value)} required
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="">— selecione —</option>
                    {(cadastros.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}{c.unidade ? ` (${c.unidade})` : ""}</option>
                    ))}
                  </select>
                  {cadastros.data && cadastros.data.length === 0 && (
                    <p className="text-xs text-muted-foreground">Cadastre análises em Cadastros &gt; Análises antes de registrar.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Resultado</Label>
                  <Input type="number" step="any" value={resultado} onChange={(e) => setResultado(e.target.value === "" ? "" : Number(e.target.value))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Observação</Label>
                  <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>Salvar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {(analises.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem análises registradas. Adicione análises de qualidade para incluí-las nos relatórios de saída e expedição.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Análise</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Faixa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analises.data!.map((a: any) => {
                  const ref = a.analise as { nome: string; unidade: string | null; valor_min: number | null; valor_max: number | null } | null;
                  const v = Number(a.resultado);
                  const min = ref?.valor_min != null ? Number(ref.valor_min) : null;
                  const max = ref?.valor_max != null ? Number(ref.valor_max) : null;
                  const fora = (min != null && v < min) || (max != null && v > max);
                  const hasRange = min != null || max != null;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>{formatDate(a.registrado_em)}</TableCell>
                      <TableCell>{ref?.nome ?? "—"}</TableCell>
                      <TableCell className="font-mono">{formatNumber(v)}{ref?.unidade ? ` ${ref.unidade}` : ""}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{hasRange ? `${min ?? "—"} ↔ ${max ?? "—"}` : "—"}</TableCell>
                      <TableCell>{hasRange ? (fora
                        ? <Badge className="bg-destructive/20 text-destructive border-destructive/30" variant="outline">Fora</Badge>
                        : <Badge className="bg-success/20 text-success border-success/30" variant="outline">Ok</Badge>) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.observacao ?? "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => remover(a.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
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
