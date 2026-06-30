import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export type ApprovalPayload = {
  numero?: string;
  destinos?: Array<{ tanque_id: string; produto_id?: string; quantidade: number }>;
  analises?: Array<{ analise_id: string; resultado: number }>;
};

type Tanque = { id: string; codigo: string; nome: string };
type Analise = { id: string; nome: string; unidade: string | null };
type Produto = { id: string; codigo: string; nome: string };

export function ApprovalDialog({
  open,
  onOpenChange,
  flowName,
  opNumero,
  opProdutoId,
  qtdSugerida,
  needsDestinos,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  flowName: string;
  opNumero: string;
  opProdutoId: string | null;
  qtdSugerida: number;
  needsDestinos: boolean;
  onConfirm: (payload: ApprovalPayload) => void | Promise<void>;
  busy: boolean;
}) {
  const [tanques, setTanques] = useState<Tanque[]>([]);
  const [analisesCat, setAnalisesCat] = useState<Analise[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [numero, setNumero] = useState("");
  const [destinos, setDestinos] = useState<
    Array<{ tanque_id: string; produto_id: string; quantidade: string }>
  >([]);
  const [analises, setAnalises] = useState<Array<{ analise_id: string; resultado: string }>>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: t }, { data: a }, { data: p }] = await Promise.all([
        supabase.from("tanques").select("id,codigo,nome").order("nome"),
        supabase.from("analises_cadastro").select("id,nome,unidade").order("nome"),
        supabase.from("produtos").select("id,codigo,nome").eq("ativo", true).order("nome"),
      ]);
      setTanques((t ?? []) as Tanque[]);
      setAnalisesCat((a ?? []) as Analise[]);
      setProdutos((p ?? []) as Produto[]);
      setNumero(opNumero ?? "");
      if (needsDestinos) {
        setDestinos([
          { tanque_id: "", produto_id: opProdutoId ?? "", quantidade: String(qtdSugerida || "") },
        ]);
      } else {
        setDestinos([]);
      }
      setAnalises([]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const somaDestinos = destinos.reduce((s, d) => s + (Number(d.quantidade) || 0), 0);
  const produtosUnicos = new Set(destinos.map((d) => d.produto_id).filter(Boolean));
  const multiplosProdutos = produtosUnicos.size > 1;

  const valido =
    !!numero.trim() &&
    (!needsDestinos ||
      destinos.every(
        (d) =>
          d.tanque_id &&
          Number(d.quantidade) > 0 &&
          (!multiplosProdutos || !!d.produto_id),
      ));

  function submit() {
    const payload: ApprovalPayload = {};
    if (numero.trim() && numero.trim() !== opNumero) payload.numero = numero.trim();
    const dest = destinos
      .filter((d) => d.tanque_id && Number(d.quantidade) > 0)
      .map((d) => ({
        tanque_id: d.tanque_id,
        produto_id: d.produto_id || undefined,
        quantidade: Number(d.quantidade),
      }));
    if (dest.length) payload.destinos = dest;
    const an = analises
      .filter((a) => a.analise_id && a.resultado !== "")
      .map((a) => ({ analise_id: a.analise_id, resultado: Number(a.resultado) }));
    if (an.length) payload.analises = an;
    onConfirm(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aprovar: {flowName}</DialogTitle>
          <DialogDescription>
            Configure produto(s), destinos de armazenamento e registre análises. O horário de
            finalização permanece o do gatilho disparado.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto">
          <section className="space-y-1">
            <Label className="text-sm font-semibold">Número da OP</Label>
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="OP-..."
            />
          </section>

          {needsDestinos && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Produtos e locais de armazenamento
                </Label>
                <div className="text-xs text-muted-foreground">
                  Total: {somaDestinos} {qtdSugerida ? `(sugerido ${qtdSugerida})` : ""}
                </div>
              </div>
              {multiplosProdutos && (
                <div className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                  Mais de um produto detectado — informe produto, tanque e quantidade em cada linha.
                </div>
              )}
              <div className="space-y-2">
                {destinos.map((d, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_120px_auto] gap-2">
                    <Select
                      value={d.produto_id}
                      onValueChange={(v) =>
                        setDestinos((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, produto_id: v } : x)),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {produtos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.codigo} — {p.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={d.tanque_id}
                      onValueChange={(v) =>
                        setDestinos((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, tanque_id: v } : x)),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tanque/Local" />
                      </SelectTrigger>
                      <SelectContent>
                        {tanques.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.codigo} — {t.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="any"
                      placeholder="Qtd"
                      value={d.quantidade}
                      onChange={(e) =>
                        setDestinos((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, quantidade: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDestinos((arr) => arr.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDestinos((arr) => [
                      ...arr,
                      { tanque_id: "", produto_id: opProdutoId ?? "", quantidade: "" },
                    ])
                  }
                >
                  <Plus className="mr-1 size-3" /> Adicionar produto/destino
                </Button>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <Label className="text-sm font-semibold">Análises da produção (opcional)</Label>
            <div className="space-y-2">
              {analises.map((a, i) => {
                const cat = analisesCat.find((x) => x.id === a.analise_id);
                return (
                  <div key={i} className="flex gap-2">
                    <Select
                      value={a.analise_id}
                      onValueChange={(v) =>
                        setAnalises((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, analise_id: v } : x)),
                        )
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Análise" />
                      </SelectTrigger>
                      <SelectContent>
                        {analisesCat.map((x) => (
                          <SelectItem key={x.id} value={x.id}>
                            {x.nome} {x.unidade ? `(${x.unidade})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="any"
                      placeholder={cat?.unidade ?? "Resultado"}
                      className="w-36"
                      value={a.resultado}
                      onChange={(e) =>
                        setAnalises((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, resultado: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAnalises((arr) => arr.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setAnalises((arr) => [...arr, { analise_id: "", resultado: "" }])
                }
              >
                <Plus className="mr-1 size-3" /> Adicionar análise
              </Button>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || !valido}>
            {busy ? "Aprovando…" : "Aprovar e executar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
