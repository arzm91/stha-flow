import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { indiceCorrigido } from "@/lib/reports-v2/producao-periodo";

type Ordem = { id: string; numero: string; qtd_produzida: number | null; concentracao_media: number | null; responsavel_fechamento: string | null; produto: { concentracao: number | null } | null };
type Mat = { id: string; quantidade_consumida: number | null; mp: { nome: string } | null };

const dt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const toN = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function EditarOrdemDialog({ ordem, onClose, onDone }: { ordem: Ordem | null; onClose: () => void; onDone: () => void }) {
  const [qtd, setQtd] = useState("");
  const [conc, setConc] = useState("");
  const [resp, setResp] = useState("");
  const [motivo, setMotivo] = useState("");
  const [mats, setMats] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const materiais = useQuery({
    queryKey: ["ordem-edit-mats", ordem?.id],
    enabled: !!ordem,
    queryFn: async () => {
      const { data, error } = await supabase.from("ordem_materiais").select("id,quantidade_consumida,mp:materia_prima_id(nome)").eq("ordem_id", ordem!.id).order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Mat[];
    },
  });
  const historico = useQuery({
    queryKey: ["ordem-edicoes", ordem?.id],
    enabled: !!ordem,
    queryFn: async () => (await supabase.from("ordem_edicoes").select("id,user_nome,created_at,motivo").eq("ordem_id", ordem!.id).order("created_at", { ascending: false })).data ?? [],
  });

  useEffect(() => {
    if (!ordem) return;
    setQtd(ordem.qtd_produzida?.toString() ?? "");
    setConc(ordem.concentracao_media?.toString() ?? "");
    setResp(ordem.responsavel_fechamento ?? "");
    setMotivo("");
  }, [ordem]);
  useEffect(() => {
    setMats(Object.fromEntries((materiais.data ?? []).map((m) => [m.id, m.quantidade_consumida?.toString() ?? ""])));
  }, [materiais.data]);

  const lista = materiais.data ?? [];
  const primeira = lista[0];
  const previa = indiceCorrigido(Number(toN(primeira ? mats[primeira.id] ?? "" : "") ?? 0), Number(toN(qtd) ?? 0), ordem?.produto?.concentracao ?? null, toN(conc));

  const salvar = async () => {
    if (!ordem) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sessão expirada");
      const { data: prof } = await supabase.from("profiles").select("nome,email").eq("id", uid).maybeSingle();
      const nome = prof?.nome || prof?.email || u.user?.email || "usuário";
      const alteracoes: Record<string, { de: unknown; para: unknown }> = {};
      const nq = toN(qtd), nc = toN(conc), nr = resp.trim() || null;
      if (nq !== ordem.qtd_produzida) alteracoes["qtd_produzida"] = { de: ordem.qtd_produzida, para: nq };
      if (nc !== ordem.concentracao_media) alteracoes["concentracao_media"] = { de: ordem.concentracao_media, para: nc };
      if (nr !== ordem.responsavel_fechamento) alteracoes["responsavel_fechamento"] = { de: ordem.responsavel_fechamento, para: nr };
      for (const m of lista) {
        const v = toN(mats[m.id] ?? "");
        if (v !== m.quantidade_consumida) {
          alteracoes[`consumo:${m.mp?.nome ?? m.id}`] = { de: m.quantidade_consumida, para: v };
          const { error } = await supabase.from("ordem_materiais").update({ quantidade_consumida: v }).eq("id", m.id);
          if (error) throw error;
        }
      }
      if (Object.keys(alteracoes).length === 0) { toast.info("Nenhuma alteração."); setSaving(false); return; }
      const agora = new Date().toISOString();
      const { error: e1 } = await supabase.from("ordens_producao").update({
        qtd_produzida: nq ?? 0, concentracao_media: nc, responsavel_fechamento: nr, indice_conversao: previa,
        editado_em: agora, editado_por: uid, editado_por_nome: nome,
      }).eq("id", ordem.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("ordem_edicoes").insert({ ordem_id: ordem.id, user_nome: nome, motivo: motivo.trim() || null, alteracoes: alteracoes as never });
      if (e2) throw e2;
      toast.success("Ordem atualizada.");
      onDone(); onClose();
    } catch (e) { toast.error("Erro ao salvar: " + (e as Error).message); }
    setSaving(false);
  };

  return (
    <Dialog open={!!ordem} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Editar ordem {ordem?.numero}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Quantidade produzida</Label><Input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
            <div><Label className="text-xs">Concentração média (%)</Label><Input inputMode="decimal" value={conc} onChange={(e) => setConc(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">Matérias-primas consumidas</Label>
            {lista.length === 0 ? <p className="text-sm text-muted-foreground">{materiais.isLoading ? "Carregando..." : "Sem matérias-primas nesta ordem."}</p> : (
              <div className="mt-1 grid gap-2">
                {lista.map((m, i) => (
                  <div key={m.id} className="grid grid-cols-[1fr_140px] items-center gap-2">
                    <span className="text-sm">{m.mp?.nome ?? "—"}{i === 0 && <span className="ml-2 text-xs text-muted-foreground">(base do índice)</span>}</span>
                    <Input inputMode="decimal" value={mats[m.id] ?? ""} onChange={(e) => setMats((s) => ({ ...s, [m.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="text-sm">Índice recalculado: <span className="font-mono font-semibold">{previa == null ? "—" : previa.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</span></div>
          <div><Label className="text-xs">Responsável</Label><Input value={resp} onChange={(e) => setResp(e.target.value)} /></div>
          <div><Label className="text-xs">Motivo da edição (opcional)</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          {(historico.data ?? []).length > 0 && (
            <div className="rounded-md border p-2">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Histórico de edições</div>
              {(historico.data ?? []).map((h) => (
                <div key={h.id} className="text-xs">{dt(h.created_at)} — {h.user_nome ?? "—"}{h.motivo ? `: ${h.motivo}` : ""}</div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
