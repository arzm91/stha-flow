import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CalendarClock, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Sev = "info" | "warn" | "critical";

type Rotina = {
  id: string;
  nome: string;
  descricao: string | null;
  dias_semana: number[];
  hora: string;         // "HH:MM:SS"
  timezone: string;
  severidade: Sev;
  ativo: boolean;
};

const DIAS = [
  { i: 1, curto: "Seg", longo: "Segunda" },
  { i: 2, curto: "Ter", longo: "Terça" },
  { i: 3, curto: "Qua", longo: "Quarta" },
  { i: 4, curto: "Qui", longo: "Quinta" },
  { i: 5, curto: "Sex", longo: "Sexta" },
  { i: 6, curto: "Sáb", longo: "Sábado" },
  { i: 0, curto: "Dom", longo: "Domingo" },
];

const SEV_BADGE: Record<Sev, string> = {
  info: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  critical: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

function hhmm(h: string) {
  return (h ?? "").slice(0, 5);
}

export function RotinasSemanais() {
  const [rotinas, setRotinas] = useState<Rotina[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rotina | null>(null);
  const blank: Partial<Rotina> = {
    nome: "", descricao: "", dias_semana: [1], hora: "08:00",
    timezone: "America/Sao_Paulo", severidade: "info", ativo: true,
  };
  const [form, setForm] = useState<Partial<Rotina>>(blank);

  async function load() {
    const { data, error } = await supabase
      .from("rotinas_atividades")
      .select("id,nome,descricao,dias_semana,hora,timezone,severidade,ativo")
      .order("hora");
    if (error) { toast.error(error.message); return; }
    setRotinas((data ?? []) as Rotina[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("rotinas_atividades_ui")
      .on("postgres_changes", { event: "*", schema: "public", table: "rotinas_atividades" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  function openNew() {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  }
  function openEdit(r: Rotina) {
    setEditing(r);
    setForm({ ...r, hora: hhmm(r.hora) });
    setOpen(true);
  }

  async function save() {
    if (!form.nome?.trim()) { toast.error("Informe um nome"); return; }
    if (!form.hora) { toast.error("Informe a hora"); return; }
    if (!form.dias_semana?.length) { toast.error("Selecione ao menos um dia"); return; }

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const payload = {
      owner_id: u.user.id,
      nome: form.nome!.trim(),
      descricao: form.descricao || null,
      dias_semana: form.dias_semana,
      hora: form.hora!.length === 5 ? `${form.hora}:00` : form.hora,
      timezone: form.timezone || "America/Sao_Paulo",
      severidade: (form.severidade ?? "info") as Sev,
      ativo: form.ativo ?? true,
    };

    const q = editing
      ? supabase.from("rotinas_atividades").update(payload).eq("id", editing.id)
      : supabase.from("rotinas_atividades").insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Rotina atualizada" : "Rotina criada");
    setOpen(false);
  }

  async function remove(r: Rotina) {
    if (!confirm(`Excluir rotina "${r.nome}"?`)) return;
    const { error } = await supabase.from("rotinas_atividades").delete().eq("id", r.id);
    if (error) toast.error(error.message);
  }

  async function toggleAtivo(r: Rotina) {
    const { error } = await supabase
      .from("rotinas_atividades").update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) toast.error(error.message);
  }

  function toggleDia(i: number) {
    const cur = new Set(form.dias_semana ?? []);
    if (cur.has(i)) cur.delete(i); else cur.add(i);
    setForm({ ...form, dias_semana: Array.from(cur).sort() });
  }

  // agrupa rotinas por dia para o grid semanal
  const porDia = useMemo(() => {
    const map = new Map<number, Rotina[]>();
    for (const d of DIAS) map.set(d.i, []);
    for (const r of rotinas) {
      for (const d of r.dias_semana ?? []) {
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(r);
      }
    }
    for (const [, list] of map) list.sort((a, b) => hhmm(a.hora).localeCompare(hhmm(b.hora)));
    return map;
  }, [rotinas]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cadastre atividades que se repetem toda semana. Quando a hora chega, uma tarefa
          aparece na central de notificações (mesma popup dos alertas, aba <b>Tarefas</b>).
        </p>
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" /> Nova rotina
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {DIAS.map((d) => {
          const items = porDia.get(d.i) ?? [];
          return (
            <Card key={d.i} className="min-h-40">
              <CardContent className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{d.longo}</span>
                  <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                </div>
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Sem rotinas</p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map((r) => (
                      <li
                        key={`${r.id}-${d.i}`}
                        className={`rounded-md border p-2 text-xs ${r.ativo ? "" : "opacity-50"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <CalendarClock className="size-3 shrink-0 text-muted-foreground" />
                              <span className="font-medium">{hhmm(r.hora)}</span>
                              <Badge variant="outline" className={`h-4 px-1 text-[9px] ${SEV_BADGE[r.severidade]}`}>
                                {r.severidade}
                              </Badge>
                            </div>
                            <div className="mt-0.5 truncate">{r.nome}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Switch checked={r.ativo} onCheckedChange={() => toggleAtivo(r)} />
                          </div>
                        </div>
                        <div className="mt-1 flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="size-6" onClick={() => openEdit(r)}>
                            <Pencil className="size-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-6" onClick={() => remove(r)}>
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar rotina" : "Nova rotina"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Ronda de campo" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Hora</Label>
                <Input type="time" value={hhmm(form.hora ?? "08:00")} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
              </div>
              <div>
                <Label>Severidade</Label>
                <Select value={form.severidade ?? "info"} onValueChange={(v) => setForm({ ...form, severidade: v as Sev })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warn">Atenção</SelectItem>
                    <SelectItem value="critical">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1 block">Dias da semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map((d) => {
                  const on = (form.dias_semana ?? []).includes(d.i);
                  return (
                    <Button
                      key={d.i}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() => toggleDia(d.i)}
                    >
                      {d.curto}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ativo-rot" checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label htmlFor="ativo-rot">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
