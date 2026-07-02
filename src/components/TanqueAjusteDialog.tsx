import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tanque: {
    id: string;
    codigo: string;
    nome: string;
    unidade?: string | null;
    capacidade?: number | string | null;
    produto_id?: string | null;
  } | null;
  saldoAtual: number;
  onSaved?: () => void;
};

type AnaliseRow = {
  analise_id: string;
  resultado: string;
  observacao: string;
};

export function TanqueAjusteDialog({ open, onOpenChange, tanque, saldoAtual, onSaved }: Props) {
  const qc = useQueryClient();
  const [saldo, setSaldo] = useState<string>("");
  const [produtoId, setProdutoId] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [novasAnalises, setNovasAnalises] = useState<AnaliseRow[]>([]);
  const [saving, setSaving] = useState(false);

  const produtos = useQuery({
    queryKey: ["produtos-ajuste"],
    queryFn: async () => (await supabase.from("produtos").select("id,nome,codigo").order("nome")).data ?? [],
    enabled: open,
  });
  const cadastros = useQuery({
    queryKey: ["analises-cadastro-ajuste"],
    queryFn: async () => (await supabase.from("analises_cadastro").select("id,nome,unidade,valor_min,valor_max").order("nome")).data ?? [],
    enabled: open,
  });
  const analisesRecentes = useQuery({
    queryKey: ["tanque-analises-recent", tanque?.id],
    queryFn: async () => {
      if (!tanque) return [];
      return (await supabase.from("tanque_analises")
        .select("*, analise:analise_id(nome,unidade)")
        .eq("tanque_id", tanque.id)
        .order("registrado_em", { ascending: false })
        .limit(10)).data ?? [];
    },
    enabled: open && !!tanque,
  });

  useEffect(() => {
    if (open && tanque) {
      setSaldo(String(saldoAtual ?? 0));
      setProdutoId(tanque.produto_id ?? "");
      setObservacao("");
      setNovasAnalises([]);
    }
  }, [open, tanque, saldoAtual]);

  if (!tanque) return null;

  const cap = tanque.capacidade ? Number(tanque.capacidade) : null;
  const saldoNum = Number(saldo);
  const pct = cap && cap > 0 && !Number.isNaN(saldoNum) ? Math.max(0, Math.min(100, (saldoNum / cap) * 100)) : null;

  const addAnaliseRow = () => setNovasAnalises((rows) => [...rows, { analise_id: "", resultado: "", observacao: "" }]);
  const updateAnaliseRow = (i: number, patch: Partial<AnaliseRow>) =>
    setNovasAnalises((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeAnaliseRow = (i: number) => setNovasAnalises((rows) => rows.filter((_, idx) => idx !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saldo === "" || Number.isNaN(Number(saldo))) return toast.error("Informe um saldo válido");
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");

      // 1) update produto do tanque (se mudou)
      if ((produtoId || null) !== (tanque.produto_id ?? null)) {
        const { error } = await supabase.from("tanques")
          .update({ produto_id: produtoId || null })
          .eq("id", tanque.id);
        if (error) throw error;
      }

      // 2) registrar ajuste de saldo
      const { error: eAj } = await supabase.from("tanque_ajustes_saldo").insert({
        tanque_id: tanque.id,
        produto_id: produtoId || null,
        saldo: Number(saldo),
        observacao: observacao || null,
        ajustado_por: u.user.id,
      } as never);
      if (eAj) throw eAj;

      // 3) inserir análises novas (se houver)
      const validas = novasAnalises.filter((a) => a.analise_id && a.resultado !== "" && !Number.isNaN(Number(a.resultado)));
      if (validas.length > 0) {
        const { error: eAn } = await supabase.from("tanque_analises").insert(
          validas.map((a) => ({
            tanque_id: tanque.id,
            analise_id: a.analise_id,
            resultado: Number(a.resultado),
            observacao: a.observacao || null,
          })) as never,
        );
        if (eAn) throw eAn;
      }

      toast.success("Local atualizado");
      qc.invalidateQueries({ queryKey: ["tanques"] });
      qc.invalidateQueries({ queryKey: ["tanque-ajustes"] });
      qc.invalidateQueries({ queryKey: ["tanque-analises-latest"] });
      qc.invalidateQueries({ queryKey: ["tanque-analises-recent", tanque.id] });
      qc.invalidateQueries({ queryKey: ["tanque", tanque.id] });
      qc.invalidateQueries({ queryKey: ["tanque-analises", tanque.id] });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajuste diário — {tanque.codigo} · {tanque.nome}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Saldo atual medido {tanque.unidade ? `(${tanque.unidade})` : ""}</Label>
              <Input type="number" step="any" value={saldo} onChange={(e) => setSaldo(e.target.value)} required />
              <p className="text-[11px] text-muted-foreground">
                Saldo antes do ajuste: <span className="font-mono">{formatNumber(saldoAtual)}</span>
                {cap ? ` · Capacidade ${formatNumber(cap)}${tanque.unidade ? ` ${tanque.unidade}` : ""}` : ""}
                {pct != null ? ` · ${pct.toFixed(1)}% ocupado` : ""}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Produto armazenado</Label>
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— nenhum —</option>
                {(produtos.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} placeholder="Ex.: leitura diária das 08h" />
          </div>

          <Separator />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Análises do produto armazenado</div>
                <div className="text-[11px] text-muted-foreground">Adicione medições feitas junto com o ajuste. Elas ficam vinculadas ao local.</div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addAnaliseRow}>
                <Plus className="mr-1 h-3 w-3" />Nova análise
              </Button>
            </div>

            {novasAnalises.length > 0 && (
              <div className="space-y-2">
                {novasAnalises.map((row, i) => {
                  const cad = (cadastros.data ?? []).find((c) => c.id === row.analise_id);
                  return (
                    <div key={i} className="grid grid-cols-[1.4fr_1fr_1.6fr_auto] items-end gap-2 rounded-md border border-border p-2">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Análise</Label>
                        <select value={row.analise_id} onChange={(e) => updateAnaliseRow(i, { analise_id: e.target.value })}
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                          <option value="">— selecione —</option>
                          {(cadastros.data ?? []).map((c) => (
                            <option key={c.id} value={c.id}>{c.nome}{c.unidade ? ` (${c.unidade})` : ""}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Resultado {cad?.unidade ? `(${cad.unidade})` : ""}</Label>
                        <Input type="number" step="any" value={row.resultado} onChange={(e) => updateAnaliseRow(i, { resultado: e.target.value })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Observação</Label>
                        <Input value={row.observacao} onChange={(e) => updateAnaliseRow(i, { observacao: e.target.value })} className="h-8 text-xs" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeAnaliseRow(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {(analisesRecentes.data ?? []).length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Últimas análises registradas</div>
                <div className="max-h-32 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <tbody>
                      {analisesRecentes.data!.map((a: any) => (
                        <tr key={a.id} className="border-b border-border last:border-0">
                          <td className="px-2 py-1 text-muted-foreground">{formatDate(a.registrado_em)}</td>
                          <td className="px-2 py-1">{a.analise?.nome ?? "—"}</td>
                          <td className="px-2 py-1 font-mono">{formatNumber(Number(a.resultado))}{a.analise?.unidade ? ` ${a.analise.unidade}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Salvar ajuste</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
