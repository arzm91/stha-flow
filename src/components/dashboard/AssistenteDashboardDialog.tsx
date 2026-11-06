import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sugerirPainel, type SugestaoWidget } from "@/lib/dashboard/assistente.functions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getSource } from "@/lib/dashboard/widget-catalog";

export function AssistenteDashboardDialog({ painelId, painelNome, temCards, onClose, onDone }: {
  painelId: string; painelNome: string; temCards: boolean; onClose: () => void; onDone: () => void;
}) {
  const sugerir = useServerFn(sugerirPainel);
  const [pedido, setPedido] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sug, setSug] = useState<SugestaoWidget[] | null>(null);

  async function gerar() {
    if (pedido.trim().length < 3) return toast.error("Descreva o painel que você quer");
    setLoading(true);
    try {
      const r = await sugerir({ data: { pedido, atual: sug?.map((s) => ({ fonte: s.fonte, titulo: s.titulo })) } });
      setSug(r.widgets);
      setPedido("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setLoading(false); }
  }

  async function aplicar(substituir: boolean) {
    if (!sug) return;
    if (substituir && !confirm(`Substituir todos os cards do painel "${painelNome}"?`)) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");
      if (substituir) {
        const { error } = await supabase.from("dashboard_widgets").delete().eq("dashboard_id", painelId).eq("user_id", u.user.id);
        if (error) throw error;
      }
      const { error } = await supabase.from("dashboard_widgets").insert(sug.map((s) => ({
        user_id: u.user!.id, dashboard_id: painelId, titulo: s.titulo, tipo: s.tipo, fonte: s.fonte,
        config: s.config as never, layout: (substituir ? s.layout : { ...s.layout, y: 10000 + s.layout.y }) as never,
      })));
      if (error) throw error;
      toast.success("Painel atualizado");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Criar painel com assistente</DialogTitle>
          <DialogDescription>Descreva o que quer ver na TV. Você confere a prévia antes de salvar.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} value={pedido} onChange={(e) => setPedido(e.target.value)}
          placeholder={sug ? "Peça ajustes: ex. tira o estoque, aumenta a temperatura…" : "Ex.: painel do reator com temperatura, pressão, produção de hoje com meta 50000, paradas e alertas"} />
        {sug && (
          <div className="max-h-72 overflow-y-auto rounded-md border">
            <div className="relative grid grid-cols-12 gap-1 p-2" style={{ gridAutoRows: "28px" }}>
              {sug.map((s, i) => (
                <div key={i} className="rounded border bg-muted/40 p-1.5 text-xs overflow-hidden"
                  style={{ gridColumn: `${s.layout.x + 1} / span ${s.layout.w}`, gridRow: `${s.layout.y + 1} / span ${s.layout.h}` }}>
                  <div className="font-semibold truncate">{s.titulo}</div>
                  <Badge variant="outline" className="mt-0.5 text-[10px]">{getSource(s.fonte)?.label}</Badge>
                  {typeof s.config.tag_nome === "string" && <div className="truncate text-muted-foreground">{s.config.tag_nome}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={gerar} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{sug ? "Ajustar" : "Gerar prévia"}
          </Button>
          {sug && (
            <div className="flex gap-2">
              {temCards && <Button variant="outline" onClick={() => aplicar(false)} disabled={saving}>Adicionar ao painel</Button>}
              <Button onClick={() => aplicar(temCards)} disabled={saving}>{temCards ? "Substituir painel" : "Salvar painel"}</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
