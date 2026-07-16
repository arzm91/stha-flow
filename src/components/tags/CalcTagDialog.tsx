import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { compileFormula, evaluateCalcTags, validateFormula, type CalcTag } from "@/lib/tags/calc";
import { formatNumber } from "@/lib/format";

export type CalcTagDialogProps = {
  open: boolean;
  onClose: () => void;
  editing: CalcTag | null;
  liveValues: Map<string, number>;      // valores atuais (endpoint + calculadas)
  existingCalcTags: CalcTag[];          // outras calculadas (para preview + ciclo)
  existingNames: Set<string>;           // nomes já usados em tags_live (endpoint)
};

export function CalcTagDialog({
  open, onClose, editing, liveValues, existingCalcTags, existingNames,
}: CalcTagDialogProps) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [nomeAmigavel, setNomeAmigavel] = useState("");
  const [formula, setFormula] = useState("");
  const [unidade, setUnidade] = useState("");
  const [grupo, setGrupo] = useState("Calculadas");
  const [decimais, setDecimais] = useState("2");
  const [vMin, setVMin] = useState("");
  const [vMax, setVMax] = useState("");

  useEffect(() => {
    if (open) {
      setNome(editing?.nome ?? "");
      setNomeAmigavel(editing?.nome_amigavel ?? "");
      setFormula(editing?.formula ?? "");
      setUnidade(editing?.unidade ?? "");
      setGrupo(editing?.grupo ?? "Calculadas");
      setDecimais(String(editing?.decimais ?? 2));
      setVMin(editing?.valor_min != null ? String(editing.valor_min) : "");
      setVMax(editing?.valor_max != null ? String(editing.valor_max) : "");
    }
  }, [open, editing]);

  const validation = useMemo(() => validateFormula(formula), [formula]);
  const referenced = validation.ok ? validation.vars : [];

  const preview = useMemo(() => {
    if (!validation.ok || !nome.trim()) return { valor: null as number | null, erro: null as string | null };
    // simula com a tag atual incluída na lista
    const others = existingCalcTags.filter((t) => t.nome !== (editing?.nome ?? "__none__"));
    const tempTag: CalcTag = {
      id: editing?.id ?? "preview",
      nome: nome.trim(),
      nome_amigavel: null, formula, unidade: null, grupo: null,
      decimais: 2, valor_min: null, valor_max: null,
      ativo: true, owner_id: "preview",
    };
    const result = evaluateCalcTags([...others, tempTag], liveValues);
    return result.get(tempTag.nome) ?? { valor: null, erro: null };
  }, [validation.ok, formula, nome, liveValues, existingCalcTags, editing]);

  const save = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (!n) throw new Error("Informe um nome");
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n))
        throw new Error("Nome deve começar com letra/_ e conter apenas letras, números ou _");
      if (!validation.ok) throw new Error(validation.error);
      // valida ciclo simulando junto às demais
      try { compileFormula(formula); } catch (e: any) { throw new Error(e.message); }

      // colisão com tag do endpoint
      const isEditingSameName = editing?.nome === n;
      if (!isEditingSameName && existingNames.has(n)) {
        throw new Error(`Já existe uma tag chamada "${n}" recebida do endpoint. Escolha outro nome.`);
      }

      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) throw new Error("Sessão expirada");

      const payload = {
        nome: n,
        nome_amigavel: nomeAmigavel.trim() || null,
        formula: formula.trim(),
        unidade: unidade.trim() || null,
        grupo: grupo.trim() || "Calculadas",
        decimais: Math.max(0, Math.min(6, Number(decimais) || 0)),
        valor_min: vMin.trim() === "" ? null : Number(vMin),
        valor_max: vMax.trim() === "" ? null : Number(vMax),
        owner_id: uid,
      };

      if (editing) {
        // se mudou o nome, apaga a linha antiga em tags_live
        if (editing.nome !== n) {
          await supabase.from("tags_live").delete().eq("nome", editing.nome).eq("owner_id", uid);
        }
        const { error } = await supabase
          .from("tags_calculadas" as never)
          .update(payload as never)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tags_calculadas" as never)
          .insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Tag calculada atualizada" : "Tag calculada criada");
      qc.invalidateQueries({ queryKey: ["tags-calculadas"] });
      qc.invalidateQueries({ queryKey: ["tags-live"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const previewDecimais = Math.max(0, Math.min(6, Number(decimais) || 0));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar tag calculada" : "Nova tag calculada"}</DialogTitle>
          <DialogDescription>
            Crie uma tag virtual que é derivada de uma fórmula sobre outras tags. Ela aparece em
            todo o sistema (alertas, monitoramento, SCADA) como se fosse uma tag normal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome interno *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="vazao_kg_h" />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sem espaços. Ex.: <code>vazao_kg_h</code>
              </p>
            </div>
            <div>
              <Label>Nome amigável</Label>
              <Input value={nomeAmigavel} onChange={(e) => setNomeAmigavel(e.target.value)} placeholder="Vazão (kg/h)" />
            </div>
          </div>

          <div>
            <Label>Fórmula *</Label>
            <Textarea
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="(vazao_a / vazao_b) * 1000"
              rows={2}
              className="font-mono text-sm"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>Operadores: <code>+ − × ÷ %  ^ ( )</code></span>
              <span>Funções: <code>sqrt, abs, min, max, round, floor, ceil, log, exp, if(cond, a, b)</code></span>
            </div>
            {!validation.ok && formula.trim() && (
              <p className="mt-1 text-xs text-destructive">{validation.error}</p>
            )}
            {validation.ok && referenced.length > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Depende de: {referenced.map((v) => <code key={v} className="mr-1">{v}</code>)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Unidade</Label>
              <Input value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="kg/h" />
            </div>
            <div>
              <Label>Grupo</Label>
              <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} />
            </div>
            <div>
              <Label>Decimais</Label>
              <Input type="number" min="0" max="6" value={decimais} onChange={(e) => setDecimais(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor mínimo</Label>
              <Input type="number" step="any" value={vMin} onChange={(e) => setVMin(e.target.value)} placeholder="—" />
            </div>
            <div>
              <Label>Valor máximo</Label>
              <Input type="number" step="any" value={vMax} onChange={(e) => setVMax(e.target.value)} placeholder="—" />
            </div>
          </div>

          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="text-[11px] text-muted-foreground">Prévia com valores atuais</div>
            <div className="mt-1 font-mono text-lg font-semibold text-primary">
              {preview.valor != null
                ? `${formatNumber(preview.valor, previewDecimais)}${unidade ? " " + unidade : ""}`
                : preview.erro ?? "—"}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !validation.ok || !nome.trim() || !formula.trim()}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
