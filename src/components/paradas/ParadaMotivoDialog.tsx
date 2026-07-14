import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertOctagon, Clock } from "lucide-react";
import { toast } from "sonner";

type Parada = {
  id: string;
  equipamento_id: string;
  ordem_producao_id: string | null;
  inicio_em: string;
  fim_em: string | null;
  duracao_seg: number | null;
  tag_nome: string | null;
  status: string;
};

type Equipamento = {
  id: string;
  nome: string;
  codigo: string;
  parada_motivos: string[] | null;
};

function fmtDuracao(seg: number | null) {
  if (seg == null) return "—";
  if (seg < 60) return `${seg}s`;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function ParadaMotivoDialog() {
  const [pendentes, setPendentes] = useState<Parada[]>([]);
  const [equipMap, setEquipMap] = useState<Record<string, Equipamento>>({});
  const [current, setCurrent] = useState<Parada | null>(null);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("paradas_equipamento")
      .select("id,equipamento_id,ordem_producao_id,inicio_em,fim_em,duracao_seg,tag_nome,status")
      .eq("status", "aguardando_motivo")
      .order("fim_em", { ascending: false });
    const rows = (data ?? []) as Parada[];
    setPendentes(rows);

    const eqIds = Array.from(new Set(rows.map((r) => r.equipamento_id)));
    if (eqIds.length > 0) {
      const { data: eq } = await supabase
        .from("equipamentos")
        .select("id,nome,codigo,parada_motivos")
        .in("id", eqIds);
      const m: Record<string, Equipamento> = {};
      (eq ?? []).forEach((e) => { m[e.id] = e as Equipamento; });
      setEquipMap(m);
    }
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("paradas_pendentes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "paradas_equipamento" },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Abre automaticamente a primeira pendente
  useEffect(() => {
    if (!current && pendentes.length > 0) {
      setCurrent(pendentes[0]);
      setMotivo("");
      setObservacao("");
    }
    if (current && !pendentes.find((p) => p.id === current.id)) {
      setCurrent(null);
    }
  }, [pendentes, current]);

  const eq = current ? equipMap[current.equipamento_id] : null;
  const motivos = useMemo<string[]>(() => {
    const arr = eq?.parada_motivos;
    if (Array.isArray(arr) && arr.length > 0) return arr;
    return ["Falta de energia","Parada programada","Parada não programada","Manutenção","Setup / Troca de produto","Falta de matéria-prima","Falha operacional","Outro"];
  }, [eq]);

  async function salvar() {
    if (!current) return;
    if (!motivo) {
      toast.error("Selecione o motivo da parada");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("paradas_equipamento").update({
      motivo,
      observacao: observacao || null,
      status: "registrada",
      registrado_por: u.user?.id ?? null,
      registrado_em: new Date().toISOString(),
    }).eq("id", current.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Motivo registrado");
    setCurrent(null);
  }

  if (!current || !eq) return null;

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) setCurrent(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertOctagon className="size-5 text-amber-500" />
            Registrar motivo de parada
          </DialogTitle>
          <DialogDescription>
            O equipamento voltou a operar. Informe o motivo para manter o histórico e os indicadores de disponibilidade corretos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{eq.codigo} — {eq.nome}</span>
              {pendentes.length > 1 ? (
                <Badge variant="outline">+{pendentes.length - 1} pendente(s)</Badge>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3" />
              Duração: <strong className="text-foreground">{fmtDuracao(current.duracao_seg)}</strong>
              <span>·</span>
              Início: {new Date(current.inicio_em).toLocaleString("pt-BR")}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Motivo *</Label>
            <div className="flex flex-wrap gap-2">
              {motivos.map((m) => (
                <button key={m} type="button"
                  onClick={() => setMotivo(m)}
                  className={`rounded-md border px-3 py-1 text-xs transition ${
                    motivo === m
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border hover:bg-muted"
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="obs">Observação (opcional)</Label>
            <textarea
              id="obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Detalhes adicionais..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setCurrent(null)}>Registrar depois</Button>
          <Button onClick={salvar} disabled={saving || !motivo}>
            {saving ? "Salvando..." : "Salvar motivo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
