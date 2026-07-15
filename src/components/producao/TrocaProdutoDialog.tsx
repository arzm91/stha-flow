import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Repeat } from "lucide-react";
import { toast } from "sonner";

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TrocaProdutoDialog({
  ordemId,
  produtoAtualId,
  produtoAtualNome,
  onDone,
  triggerLabel = "Trocar produto",
  size = "default",
}: {
  ordemId: string;
  produtoAtualId: string;
  produtoAtualNome?: string | null;
  onDone?: () => void;
  triggerLabel?: string;
  size?: "sm" | "default";
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [novoId, setNovoId] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(new Date().toISOString()));
  const [qtd, setQtd] = useState<string>("");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);

  const produtos = useQuery({
    queryKey: ["produtos-troca"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id,codigo,nome,unidade").order("nome");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (open) {
      setNovoId("");
      setWhen(toLocalInput(new Date().toISOString()));
      setQtd("");
      setObs("");
    }
  }, [open]);

  const handle = async () => {
    if (!novoId) return toast.error("Selecione o novo produto");
    if (novoId === produtoAtualId) return toast.error("O novo produto deve ser diferente do atual");
    if (!qtd || Number(qtd) < 0) return toast.error("Informe a quantidade produzida do produto anterior");
    if (!when) return toast.error("Informe a data/hora da troca");
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const iso = new Date(when).toISOString();
      const { error: e1 } = await supabase.from("ordem_trocas_produto").insert({
        ordem_id: ordemId,
        produto_anterior_id: produtoAtualId,
        produto_novo_id: novoId,
        qtd_produto_anterior: Number(qtd),
        ocorrido_em: iso,
        observacao: obs || null,
        owner_id: u.user.id,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("ordens_producao").update({ produto_id: novoId }).eq("id", ordemId);
      if (e2) throw e2;
      toast.success("Produto trocado");
      qc.invalidateQueries();
      setOpen(false);
      onDone?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size}>
          <Repeat className="mr-1 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Trocar produto da produção</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 p-2 text-sm">
            Produto atual: <span className="font-medium">{produtoAtualNome ?? "—"}</span>
          </div>
          <div className="space-y-1.5">
            <Label>Novo produto</Label>
            <select
              value={novoId}
              onChange={(e) => setNovoId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">— selecione —</option>
              {(produtos.data ?? [])
                .filter((p) => p.id !== produtoAtualId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nome}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Data e hora da troca</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade produzida do produto anterior</Label>
            <Input
              type="number"
              step="any"
              min="0"
              placeholder=""
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handle} disabled={loading}>{loading ? "Salvando..." : "Confirmar troca"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
