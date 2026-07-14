import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertOctagon, Clock, Gauge, Pencil, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type Parada = {
  id: string;
  equipamento_id: string;
  ordem_producao_id: string | null;
  inicio_em: string;
  fim_em: string | null;
  duracao_seg: number | null;
  tag_nome: string | null;
  motivo: string | null;
  observacao: string | null;
  status: string;
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

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  em_andamento: { label: "Em andamento", cls: "bg-amber-500/20 text-amber-600 border-amber-500/40" },
  aguardando_motivo: { label: "Aguardando motivo", cls: "bg-rose-500/20 text-rose-600 border-rose-500/40" },
  registrada: { label: "Registrada", cls: "bg-emerald-500/20 text-emerald-600 border-emerald-500/40" },
};

export function ParadasSection({
  equipamentoId,
  ordemId,
  inicioEm,
  fimEm,
}: {
  equipamentoId: string | null;
  ordemId?: string | null;
  inicioEm?: string | null;
  fimEm?: string | null;
}) {
  const [editing, setEditing] = useState<Parada | null>(null);

  const paradasQ = useQuery({
    queryKey: ["paradas", equipamentoId, ordemId, inicioEm, fimEm],
    enabled: !!equipamentoId,
    queryFn: async () => {
      let q = supabase
        .from("paradas_equipamento")
        .select("id,equipamento_id,ordem_producao_id,inicio_em,fim_em,duracao_seg,tag_nome,motivo,observacao,status")
        .eq("equipamento_id", equipamentoId!)
        .order("inicio_em", { ascending: false })
        .limit(200);
      if (ordemId) q = q.eq("ordem_producao_id", ordemId);
      else if (inicioEm) q = q.gte("inicio_em", inicioEm);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Parada[];
    },
    refetchInterval: 15000,
  });

  const paradas = paradasQ.data ?? [];
  const kpi = useMemo(() => {
    const total = paradas.length;
    const abertas = paradas.filter((p) => p.status === "em_andamento").length;
    const pendentes = paradas.filter((p) => p.status === "aguardando_motivo").length;
    const tempoTotalSeg = paradas.reduce((acc, p) => acc + (p.duracao_seg ?? 0), 0);

    let disponibilidade: number | null = null;
    if (inicioEm) {
      const ini = new Date(inicioEm).getTime();
      const fim = fimEm ? new Date(fimEm).getTime() : Date.now();
      const janelaSeg = Math.max(1, (fim - ini) / 1000);
      disponibilidade = Math.max(0, Math.min(100, ((janelaSeg - tempoTotalSeg) / janelaSeg) * 100));
    }

    // Pareto por motivo
    const porMotivo: Record<string, number> = {};
    paradas.filter((p) => p.motivo).forEach((p) => {
      porMotivo[p.motivo!] = (porMotivo[p.motivo!] ?? 0) + (p.duracao_seg ?? 0);
    });
    const pareto = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { total, abertas, pendentes, tempoTotalSeg, disponibilidade, pareto };
  }, [paradas, inicioEm, fimEm]);

  if (!equipamentoId) {
    return <p className="mt-4 text-sm text-muted-foreground">Nenhum equipamento associado.</p>;
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <KpiCardSmall
          icon={<TrendingUp className="size-4" />}
          label="Disponibilidade"
          value={kpi.disponibilidade == null ? "—" : `${kpi.disponibilidade.toFixed(1)}%`}
          hint={inicioEm ? "% do período em operação" : "informe período"}
          intent={kpi.disponibilidade != null && kpi.disponibilidade < 85 ? "warn" : "ok"}
        />
        <KpiCardSmall icon={<AlertOctagon className="size-4" />} label="Paradas no período" value={String(kpi.total)} hint={`${kpi.abertas} em andamento`} />
        <KpiCardSmall icon={<Clock className="size-4" />} label="Tempo total parado" value={fmtDuracao(kpi.tempoTotalSeg)} />
        <KpiCardSmall icon={<Gauge className="size-4" />} label="Pendentes de motivo" value={String(kpi.pendentes)} intent={kpi.pendentes > 0 ? "warn" : "ok"} />
      </div>

      {/* Pareto */}
      {kpi.pareto.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Principais motivos (por tempo parado)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-3">
            {kpi.pareto.map(([motivo, seg]) => {
              const pct = kpi.tempoTotalSeg > 0 ? (seg / kpi.tempoTotalSeg) * 100 : 0;
              return (
                <div key={motivo} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span>{motivo}</span>
                    <span className="text-muted-foreground">{fmtDuracao(seg)} · {pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* Lista */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico de paradas</CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          {paradas.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma parada registrada no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paradas.map((p) => {
                    const s = STATUS_LABEL[p.status] ?? { label: p.status, cls: "" };
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(p.inicio_em).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{p.fim_em ? new Date(p.fim_em).toLocaleString("pt-BR") : "—"}</TableCell>
                        <TableCell className="text-xs">{fmtDuracao(p.duracao_seg)}</TableCell>
                        <TableCell className="text-xs">{p.motivo ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell><Badge variant="outline" className={s.cls}>{s.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          {p.status !== "em_andamento" ? (
                            <Button variant="ghost" size="icon" onClick={() => setEditing(p)}>
                              <Pencil className="size-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing ? (
        <EditParadaDialog
          parada={editing}
          equipamentoId={equipamentoId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); paradasQ.refetch(); }}
        />
      ) : null}
    </div>
  );
}

function KpiCardSmall({
  icon, label, value, hint, intent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  intent?: "ok" | "warn";
}) {
  const border = intent === "warn" ? "border-amber-500/40" : "border-border";
  return (
    <div className={`rounded-md border ${border} bg-card p-3`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold tracking-tight">{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function EditParadaDialog({
  parada, equipamentoId, onClose, onSaved,
}: {
  parada: Parada;
  equipamentoId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [motivo, setMotivo] = useState(parada.motivo ?? "");
  const [observacao, setObservacao] = useState(parada.observacao ?? "");
  const [motivos, setMotivos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("equipamentos").select("parada_motivos").eq("id", equipamentoId).maybeSingle();
      const arr = (data?.parada_motivos ?? null) as string[] | null;
      setMotivos(Array.isArray(arr) && arr.length > 0 ? arr : [
        "Falta de energia","Parada programada","Parada não programada","Manutenção","Setup / Troca de produto","Falta de matéria-prima","Falha operacional","Outro",
      ]);
    })();
  }, [equipamentoId]);

  async function salvar() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("paradas_equipamento").update({
      motivo: motivo || null,
      observacao: observacao || null,
      status: motivo ? "registrada" : "aguardando_motivo",
      registrado_por: motivo ? u.user?.id ?? null : null,
      registrado_em: motivo ? new Date().toISOString() : null,
    }).eq("id", parada.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Parada atualizada");
    onSaved();
  }

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar parada</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Início: {new Date(parada.inicio_em).toLocaleString("pt-BR")} · Duração: {fmtDuracao(parada.duracao_seg)}
          </div>
          <div>
            <Label>Motivo</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {motivos.map((m) => (
                <button key={m} type="button" onClick={() => setMotivo(m)}
                  className={`rounded-md border px-2 py-1 text-xs ${motivo === m ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-muted"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="obs">Observação</Label>
            <textarea id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
