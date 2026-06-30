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
  destinos?: Array<{ tanque_id: string; quantidade: number }>;
  analises?: Array<{ analise_id: string; resultado: number }>;
};

type Tanque = { id: string; codigo: string; nome: string };
type Analise = { id: string; nome: string; unidade: string | null };

export function ApprovalDialog({
  open,
  onOpenChange,
  flowName,
  qtdSugerida,
  needsDestinos,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  flowName: string;
  qtdSugerida: number;
  needsDestinos: boolean;
  onConfirm: (payload: ApprovalPayload) => void | Promise<void>;
  busy: boolean;
}) {
  const [tanques, setTanques] = useState<Tanque[]>([]);
  const [analisesCat, setAnalisesCat] = useState<Analise[]>([]);
  const [destinos, setDestinos] = useState<Array<{ tanque_id: string; quantidade: string }>>([]);
  const [analises, setAnalises] = useState<Array<{ analise_id: string; resultado: string }>>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: t }, { data: a }] = await Promise.all([
        supabase.from("tanques").select("id,codigo,nome").eq("ativo", true).order("nome"),
        supabase.from("analises_cadastro").select("id,nome,unidade").order("nome"),
      ]);
      setTanques((t ?? []) as Tanque[]);
      setAnalisesCat((a ?? []) as Analise[]);
      if (needsDestinos && destinos.length === 0) {
        setDestinos([{ tanque_id: "", quantidade: String(qtdSugerida || "") }]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const somaDestinos = destinos.reduce((s, d) => s + (Number(d.quantidade) || 0), 0);

  const valido =
    !needsDestinos ||
    destinos.every((d) => d.tanque_id && Number(d.quantidade) > 0);

  function submit() {
    const payload: ApprovalPayload = {};
    const dest = destinos
      .filter((d) => d.tanque_id && Number(d.quantidade) > 0)
      .map((d) => ({ tanque_id: d.tanque_id, quantidade: Number(d.quantidade) }));
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
            Configure os destinos de armazenamento e registre análises. O horário de finalização
            permanece o do gatilho disparado.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-6 overflow-y-auto">
          {needsDestinos && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Locais de armazenamento</Label>
                <div className="text-xs text-muted-foreground">
                  Total: {somaDestinos} {qtdSugerida ? `(sugerido ${qtdSugerida})` : ""}
                </div>
              </div>
              <div className="space-y-2">
                {destinos.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <Select
                      value={d.tanque_id}
                      onValueChange={(v) =>
                        setDestinos((arr) => arr.map((x, j) => (j === i ? { ...x, tanque_id: v } : x)))
                      }
                    >
                      <SelectTrigger className="flex-1">
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
                      placeholder="Quantidade"
                      className="w-36"
                      value={d.quantidade}
                      onChange={(e) =>
                        setDestinos((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)),
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
                  onClick={() => setDestinos((arr) => [...arr, { tanque_id: "", quantidade: "" }])}
                >
                  <Plus className="mr-1 size-3" /> Adicionar destino
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
                        setAnalises((arr) => arr.map((x, j) => (j === i ? { ...x, analise_id: v } : x)))
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
                          arr.map((x, j) => (j === i ? { ...x, resultado: e.target.value } : x)),
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
                onClick={() => setAnalises((arr) => [...arr, { analise_id: "", resultado: "" }])}
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
