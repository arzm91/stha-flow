import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Repeat, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber } from "@/lib/format";
import { TrocaProdutoDialog } from "./TrocaProdutoDialog";

type Troca = {
  id: string;
  ocorrido_em: string;
  qtd_produto_anterior: number;
  observacao: string | null;
  produto_anterior_id: string;
  produto_novo_id: string;
  produto_anterior: { nome: string; unidade: string | null } | null;
  produto_novo: { nome: string; unidade: string | null } | null;
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TrocasProdutoList({
  ordemId,
  produtoAtualId,
  produtoAtualNome,
  allowAdd = true,
  allowEdit = true,
}: {
  ordemId: string;
  produtoAtualId: string | null;
  produtoAtualNome?: string | null;
  allowAdd?: boolean;
  allowEdit?: boolean;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["trocas-produto", ordemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordem_trocas_produto")
        .select(
          "id, ocorrido_em, qtd_produto_anterior, observacao, produto_anterior_id, produto_novo_id, produto_anterior:produto_anterior_id(nome,unidade), produto_novo:produto_novo_id(nome,unidade)",
        )
        .eq("ordem_id", ordemId)
        .order("ocorrido_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Troca[];
    },
  });

  const [editing, setEditing] = useState<Troca | null>(null);
  const [editWhen, setEditWhen] = useState("");
  const [editQtd, setEditQtd] = useState("");
  const [editObs, setEditObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setEditWhen(toLocalInput(editing.ocorrido_em));
      setEditQtd(String(editing.qtd_produto_anterior));
      setEditObs(editing.observacao ?? "");
    }
  }, [editing]);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ordem_trocas_produto")
        .update({
          ocorrido_em: new Date(editWhen).toISOString(),
          qtd_produto_anterior: Number(editQtd),
          observacao: editObs || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Troca atualizada");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["trocas-produto", ordemId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (id: string) => {
    const { error } = await supabase.from("ordem_trocas_produto").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Troca excluída");
    qc.invalidateQueries({ queryKey: ["trocas-produto", ordemId] });
  };

  const trocas = q.data ?? [];

  if (!allowAdd && trocas.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="h-4 w-4" /> Trocas de produto
        </CardTitle>
        {allowAdd && produtoAtualId ? (
          <TrocaProdutoDialog
            ordemId={ordemId}
            produtoAtualId={produtoAtualId}
            produtoAtualNome={produtoAtualNome}
            size="sm"
          />
        ) : null}
      </CardHeader>
      <CardContent>
        {trocas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma troca registrada.</p>
        ) : (
          <ol className="space-y-2">
            {trocas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2 text-sm">
                <div>
                  <div>
                    <span className="font-medium">{t.produto_anterior?.nome ?? "—"}</span>
                    {" → "}
                    <span className="font-medium">{t.produto_novo?.nome ?? "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(t.ocorrido_em)} · {formatNumber(Number(t.qtd_produto_anterior))} {t.produto_anterior?.unidade ?? ""} produzidos do anterior
                    {t.observacao ? ` · ${t.observacao}` : ""}
                  </div>
                </div>
                {allowEdit ? (
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir troca?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => doDelete(t.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar troca de produto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Data e hora</Label>
              <Input type="datetime-local" value={editWhen} onChange={(e) => setEditWhen(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade do produto anterior</Label>
              <Input type="number" step="any" min="0" value={editQtd} onChange={(e) => setEditQtd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea value={editObs} onChange={(e) => setEditObs(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
