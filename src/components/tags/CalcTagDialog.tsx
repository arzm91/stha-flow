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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [tipo, setTipo] = useState<"formula" | "delta_janela" | "acumulador_janela">("formula");
  const [formula, setFormula] = useState("");
  const [unidade, setUnidade] = useState("");
  const [grupo, setGrupo] = useState("Calculadas");
  const [decimais, setDecimais] = useState("2");
  const [vMin, setVMin] = useState("");
  const [vMax, setVMax] = useState("");
  const [tagFiltro, setTagFiltro] = useState("");
  // Config para tipo "delta_janela"
  const [snapshotTag, setSnapshotTag] = useState("");
  const [snapshotHora, setSnapshotHora] = useState("08:00");
  const [snapshotJanelaDias, setSnapshotJanelaDias] = useState("1");
  // Config para tipo "acumulador_janela"
  const [acumTag, setAcumTag] = useState("");
  const [acumResetTipo, setAcumResetTipo] = useState<"diario" | "horas">("diario");
  const [acumResetHora, setAcumResetHora] = useState("00:00");
  const [acumIntervaloHoras, setAcumIntervaloHoras] = useState("1");
  const formulaRef = useRef<HTMLTextAreaElement>(null);

  // Lista de tags disponíveis para compor a fórmula (endpoint + outras calculadas)
  const tagsDisponiveis = useQuery({
    queryKey: ["tags-live", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live" as never)
        .select("nome,nome_amigavel,unidade,grupo,valor_num")
        .order("grupo", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        nome: string;
        nome_amigavel: string | null;
        unidade: string | null;
        grupo: string | null;
        valor_num: number | null;
      }>;
    },
    enabled: open,
    refetchInterval: open ? 3000 : false,
  });

  const insertNaFormula = (texto: string) => {
    const el = formulaRef.current;
    if (!el) {
      setFormula((f) => (f ? `${f} ${texto}` : texto));
      return;
    }
    const start = el.selectionStart ?? formula.length;
    const end = el.selectionEnd ?? formula.length;
    const before = formula.slice(0, start);
    const after = formula.slice(end);
    const needSpaceBefore = before && !/[\s(]$/.test(before);
    const needSpaceAfter = after && !/^[\s)]/.test(after);
    const chunk = `${needSpaceBefore ? " " : ""}${texto}${needSpaceAfter ? " " : ""}`;
    const next = before + chunk + after;
    setFormula(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = (before + chunk).length;
      el.setSelectionRange(pos, pos);
    });
  };


  useEffect(() => {
    if (open) {
      const editingAny = editing as (CalcTag & {
        tipo?: string | null;
        snapshot_tag_nome?: string | null;
        snapshot_hora?: string | null;
        snapshot_janela_dias?: number | null;
      }) | null;
      setNome(editing?.nome ?? "");
      setNomeAmigavel(editing?.nome_amigavel ?? "");
      setTipo((editingAny?.tipo === "delta_janela" ? "delta_janela" : "formula"));
      setFormula(editing?.formula ?? "");
      setUnidade(editing?.unidade ?? "");
      setGrupo(editing?.grupo ?? "Calculadas");
      setDecimais(String(editing?.decimais ?? 2));
      setVMin(editing?.valor_min != null ? String(editing.valor_min) : "");
      setVMax(editing?.valor_max != null ? String(editing.valor_max) : "");
      setSnapshotTag(editingAny?.snapshot_tag_nome ?? "");
      setSnapshotHora(editingAny?.snapshot_hora ?? "08:00");
      setSnapshotJanelaDias(String(editingAny?.snapshot_janela_dias ?? 1));
    }
  }, [open, editing]);

  const validation = useMemo(
    () => (tipo === "formula" ? validateFormula(formula) : { ok: true as const, vars: [] as string[] }),
    [formula, tipo],
  );
  const referenced = validation.ok ? validation.vars : [];

  const preview = useMemo(() => {
    if (tipo === "delta_janela") {
      const cur = liveValues.get(snapshotTag);
      return {
        valor: null as number | null,
        erro: cur == null
          ? "Aguardando primeira captura no horário configurado"
          : "Delta será calculado após duas capturas no horário",
      };
    }
    if (!validation.ok || !nome.trim()) return { valor: null as number | null, erro: null as string | null };
    const others = existingCalcTags.filter((t) => t.nome !== (editing?.nome ?? "__none__"));
    const tempTag: CalcTag = {
      id: editing?.id ?? "preview",
      nome: nome.trim(),
      nome_amigavel: null, formula, unidade: null, grupo: null,
      decimais: 2, valor_min: null, valor_max: null,
      ativo: true, owner_id: "preview",
      tipo: "formula",
    };
    const result = evaluateCalcTags([...others, tempTag], liveValues);
    return result.get(tempTag.nome) ?? { valor: null, erro: null };
  }, [tipo, snapshotTag, validation.ok, formula, nome, liveValues, existingCalcTags, editing]);

  const save = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (!n) throw new Error("Informe um nome");
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n))
        throw new Error("Nome deve começar com letra/_ e conter apenas letras, números ou _");

      if (tipo === "formula") {
        if (!validation.ok) throw new Error(validation.error);
        try { compileFormula(formula); } catch (e: any) { throw new Error(e.message); }
      } else {
        if (!snapshotTag.trim()) throw new Error("Escolha a tag de origem");
        if (!/^\d{1,2}:\d{2}$/.test(snapshotHora)) throw new Error("Horário inválido (use HH:MM)");
        const jan = Number(snapshotJanelaDias);
        if (!Number.isFinite(jan) || jan < 1 || jan > 366) throw new Error("Janela deve estar entre 1 e 366 dias");
      }

      const isEditingSameName = editing?.nome === n;
      if (!isEditingSameName && existingNames.has(n)) {
        throw new Error(`Já existe uma tag chamada "${n}" recebida do endpoint. Escolha outro nome.`);
      }

      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) throw new Error("Sessão expirada");

      const { data: ownerId, error: ownerErr } = await supabase.rpc("effective_owner", { _user: uid });
      if (ownerErr || !ownerId) throw new Error(ownerErr?.message ?? "Não foi possível resolver o tenant");

      const payload: Record<string, unknown> = {
        nome: n,
        nome_amigavel: nomeAmigavel.trim() || null,
        unidade: unidade.trim() || null,
        grupo: grupo.trim() || "Calculadas",
        decimais: Math.max(0, Math.min(6, Number(decimais) || 0)),
        valor_min: vMin.trim() === "" ? null : Number(vMin),
        valor_max: vMax.trim() === "" ? null : Number(vMax),
        owner_id: ownerId as string,
        tipo,
        formula: tipo === "formula" ? formula.trim() : null,
        snapshot_tag_nome: tipo === "delta_janela" ? snapshotTag.trim() : null,
        snapshot_hora: tipo === "delta_janela" ? snapshotHora : null,
        snapshot_janela_dias: tipo === "delta_janela" ? Number(snapshotJanelaDias) : null,
      };

      if (editing) {
        if (editing.nome !== n) {
          await supabase.from("tags_live").delete().eq("nome", editing.nome).eq("owner_id", ownerId as string);
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

      // Garante que a tag apareça imediatamente na lista de tags ao vivo,
      // mesmo antes da primeira captura (delta_janela) ou primeiro tick (formula).
      await supabase
        .from("tags_live" as never)
        .upsert(
          {
            nome: n,
            nome_amigavel: nomeAmigavel.trim() || null,
            valor: null,
            valor_num: null,
            valor_num_bruto: null,
            unidade: unidade.trim() || null,
            grupo: grupo.trim() || "Calculadas",
            qualidade: tipo === "delta_janela" ? "aguardando" : "good",
            valor_min: vMin.trim() === "" ? null : Number(vMin),
            valor_max: vMax.trim() === "" ? null : Number(vMax),
            origem: "calculada",
            owner_id: ownerId as string,
            atualizado_em: new Date().toISOString(),
          } as never,
          { onConflict: "owner_id,nome" } as never,
        );

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
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
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
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as "formula" | "delta_janela")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="formula">Fórmula matemática</SelectItem>
                <SelectItem value="delta_janela">Delta em janela (ex: hoje 08:00 − ontem 08:00)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {tipo === "formula"
                ? "Combine outras tags com uma expressão matemática."
                : "Captura o valor de uma tag num horário fixo do dia e calcula a diferença em relação ao valor capturado N dias atrás no mesmo horário."}
            </p>
          </div>

          {tipo === "delta_janela" && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <Label>Tag de origem *</Label>
                  <Select value={snapshotTag} onValueChange={setSnapshotTag}>
                    <SelectTrigger><SelectValue placeholder="Escolha a tag…" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(tagsDisponiveis.data ?? [])
                        .filter((t) => !editing || t.nome !== editing.nome)
                        .map((t) => (
                          <SelectItem key={t.nome} value={t.nome}>
                            {(t.nome_amigavel?.trim() || t.nome)} <span className="ml-1 text-[10px] text-muted-foreground">({t.nome})</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Horário da captura *</Label>
                  <Input
                    type="time"
                    value={snapshotHora}
                    onChange={(e) => setSnapshotHora(e.target.value)}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">Fuso America/Sao_Paulo.</p>
                </div>
                <div>
                  <Label>Janela (dias) *</Label>
                  <Select value={snapshotJanelaDias} onValueChange={setSnapshotJanelaDias}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 dia (24h)</SelectItem>
                      <SelectItem value="7">7 dias (semana)</SelectItem>
                      <SelectItem value="30">30 dias (mês)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                  Ex.: horário <b>08:00</b> e janela <b>1 dia</b> → hoje às 08:00 grava o valor atual; o valor calculado
                  passa a ser <code>captura de hoje − captura de ontem</code> e permanece assim até a próxima captura.
                </div>
              </div>
            </div>
          )}

          {tipo === "formula" && (
          <>
          <div>
            <Label>Fórmula *</Label>
            <Textarea
              ref={formulaRef}
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="Clique nas tags abaixo ou digite. Ex.: (vazao_a / vazao_b) * 1000"
              rows={2}
              className="font-mono text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {["+", "-", "*", "/", "(", ")", "^", "%"].map((op) => (
                <Button
                  key={op}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 w-8 p-0 font-mono"
                  onClick={() => insertNaFormula(op)}
                >
                  {op}
                </Button>
              ))}
              {["sqrt(", "abs(", "min(", "max(", "round(", "if("].map((fn) => (
                <Button
                  key={fn}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 font-mono text-xs"
                  onClick={() => insertNaFormula(fn)}
                >
                  {fn}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setFormula("")}
              >
                Limpar
              </Button>
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

          <div className="rounded-md border p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label className="text-xs">Escolha as tags para a fórmula</Label>
              <Input
                value={tagFiltro}
                onChange={(e) => setTagFiltro(e.target.value)}
                placeholder="Filtrar tags…"
                className="h-7 max-w-[220px] text-xs"
              />
            </div>
            <div className="max-h-52 overflow-y-auto">
              {(() => {
                const q = tagFiltro.trim().toLowerCase();
                const list = (tagsDisponiveis.data ?? []).filter((t) => {
                  if (editing && t.nome === editing.nome) return false; // evita auto-ref
                  if (!q) return true;
                  return (
                    t.nome.toLowerCase().includes(q) ||
                    (t.nome_amigavel ?? "").toLowerCase().includes(q) ||
                    (t.grupo ?? "").toLowerCase().includes(q)
                  );
                });
                if (list.length === 0) {
                  return (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      Nenhuma tag disponível.
                    </div>
                  );
                }
                // Agrupa por grupo
                const grupos = new Map<string, typeof list>();
                for (const t of list) {
                  const g = t.grupo ?? "Sem grupo";
                  if (!grupos.has(g)) grupos.set(g, [] as typeof list);
                  grupos.get(g)!.push(t);
                }
                return Array.from(grupos.entries()).map(([g, items]) => (
                  <div key={g} className="mb-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {g}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {items.map((t) => (
                        <Button
                          key={t.nome}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-auto max-w-full py-1 text-left"
                          onClick={() => insertNaFormula(t.nome)}
                          title={`${t.nome} = ${t.valor_num ?? "—"}${t.unidade ? " " + t.unidade : ""}`}
                        >
                          <span className="flex flex-col items-start leading-tight">
                            <span className="max-w-[180px] truncate text-xs">
                              {t.nome_amigavel?.trim() || t.nome}
                            </span>
                            <span className="max-w-[180px] truncate font-mono text-[9px] text-muted-foreground">
                              {t.nome}
                              {t.valor_num != null ? ` · ${t.valor_num}${t.unidade ? " " + t.unidade : ""}` : ""}
                            </span>
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Clique em uma tag para inseri-la na posição do cursor. Tags calculadas também podem
              ser usadas (com detecção de ciclo).
            </p>
          </div>
          </>
          )}




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
          <Button onClick={() => save.mutate()} disabled={save.isPending || !nome.trim() || (tipo === "formula" ? (!validation.ok || !formula.trim()) : (!snapshotTag.trim() || !snapshotHora))}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
