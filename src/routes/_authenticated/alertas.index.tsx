import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Bell, Plus, Trash2, Check, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/alertas/")({
  component: AlertasPage,
});

type Severidade = "info" | "warn" | "critical";

type Alerta = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  tag_nome: string | null;
  min_val: number | null;
  max_val: number | null;
  stale_minutes: number | null;
  parametro_id: string | null;
  analise_id: string | null;
  processo_id: string | null;
  evento_processo: string | null;
  tempo_limite_minutos: number | null;
  severidade: Severidade;
  ativo: boolean;
  notificar_email: boolean;
  cooldown_minutes: number;
  last_fired_at: string | null;
};

type Parametro = { id: string; nome: string; unidade: string | null; valor_min: number | null; valor_max: number | null };
type Analise = { id: string; nome: string; unidade: string | null; valor_min: number | null; valor_max: number | null };
type Processo = { id: string; nome: string; produto_id: string };
type Produto = { id: string; nome: string };


type Disparo = {
  id: string;
  alerta_nome: string;
  severidade: Severidade;
  mensagem: string;
  contexto: Record<string, unknown> | null;
  status: "novo" | "visto" | "resolvido";
  created_at: string;
  resolvido_em: string | null;
  resolucao_nota: string | null;
};

const SEV_COLOR: Record<Severidade, string> = {
  info: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  critical: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

function AlertasPage() {
  const [tab, setTab] = useState("regras");
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [disparos, setDisparos] = useState<Disparo[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [parametros, setParametros] = useState<Parametro[]>([]);
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  // form state
  const [editing, setEditing] = useState<Alerta | null>(null);
  const [open, setOpen] = useState(false);
  const blank: Partial<Alerta> = {
    nome: "",
    descricao: "",
    tipo: "tag_min_max",
    tag_nome: "",
    severidade: "warn",
    ativo: true,
    notificar_email: false,
    cooldown_minutes: 5,
  };
  const [form, setForm] = useState<Partial<Alerta>>(blank);

  async function loadAlertas() {
    const { data, error } = await supabase
      .from("alertas")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setAlertas((data ?? []) as Alerta[]);
  }
  async function loadDisparos() {
    const { data, error } = await supabase
      .from("alertas_disparos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setDisparos((data ?? []) as Disparo[]);
  }
  async function loadTags() {
    const { data } = await supabase
      .from("tags_live")
      .select("nome")
      .order("nome");
    setTagOptions(Array.from(new Set((data ?? []).map((t) => t.nome))));
  }

  useEffect(() => {
    loadAlertas();
    loadDisparos();
    loadTags();
    const ch = supabase
      .channel("alertas_page")
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas" }, () => loadAlertas())
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas_disparos" }, () => loadDisparos())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  function openNew() {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  }
  function openEdit(a: Alerta) {
    setEditing(a);
    setForm({ ...a });
    setOpen(true);
  }

  async function save() {
    if (!form.nome?.trim()) {
      toast.error("Informe um nome");
      return;
    }
    if (form.tipo === "tag_min_max" && !form.tag_nome) {
      toast.error("Selecione uma tag");
      return;
    }
    if (
      form.tipo === "tag_min_max" &&
      form.min_val == null &&
      form.max_val == null
    ) {
      toast.error("Informe ao menos um limite (mínimo ou máximo)");
      return;
    }
    if (form.tipo === "tag_stale" && !form.stale_minutes) {
      toast.error("Informe os minutos sem atualização");
      return;
    }

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const payload = {
      owner_id: u.user.id,
      nome: form.nome!.trim(),
      descricao: form.descricao || null,
      tipo: form.tipo!,
      tag_nome: form.tag_nome || null,
      min_val: form.min_val ?? null,
      max_val: form.max_val ?? null,
      stale_minutes: form.stale_minutes ?? null,
      severidade: (form.severidade ?? "warn") as Severidade,
      ativo: form.ativo ?? true,
      notificar_email: form.notificar_email ?? false,
      cooldown_minutes: form.cooldown_minutes ?? 5,
    };

    if (editing) {
      const { requireAdminPassword } = await import("@/components/admin-password/AdminPasswordGate");
      if (!(await requireAdminPassword(`editar o alerta "${editing.nome}"`))) return;
    }
    const q = editing
      ? supabase.from("alertas").update(payload).eq("id", editing.id)
      : supabase.from("alertas").insert(payload);
    const { error } = await q;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Regra atualizada" : "Regra criada");
    setOpen(false);
  }

  async function remove(a: Alerta) {
    if (!confirm(`Excluir alerta "${a.nome}"?`)) return;
    const { requireAdminPassword } = await import("@/components/admin-password/AdminPasswordGate");
    if (!(await requireAdminPassword(`excluir o alerta "${a.nome}"`))) return;
    const { error } = await supabase.from("alertas").delete().eq("id", a.id);
    if (error) toast.error(error.message);
  }

  async function toggleAtivo(a: Alerta) {
    const { requireAdminPassword } = await import("@/components/admin-password/AdminPasswordGate");
    if (!(await requireAdminPassword(`alterar o alerta "${a.nome}"`))) return;
    const { error } = await supabase
      .from("alertas")
      .update({ ativo: !a.ativo })
      .eq("id", a.id);
    if (error) toast.error(error.message);
  }

  async function marcarVisto(d: Disparo) {
    await supabase.from("alertas_disparos").update({ status: "visto" }).eq("id", d.id);
  }

  async function resolver(d: Disparo) {
    const nota = prompt("Observação de resolução (opcional):") ?? "";
    const { data: u } = await supabase.auth.getUser();
    await supabase
      .from("alertas_disparos")
      .update({
        status: "resolvido",
        resolvido_em: new Date().toISOString(),
        resolvido_por: u.user?.id ?? null,
        resolucao_nota: nota || null,
      })
      .eq("id", d.id);
  }

  const filteredDisparos = useMemo(() => {
    if (statusFilter === "todos") return disparos;
    return disparos.filter((d) => d.status === statusFilter);
  }, [disparos, statusFilter]);

  const novos = disparos.filter((d) => d.status === "novo").length;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Alertas"
        description="Configure regras para monitorar tags e eventos, e acompanhe os alertas disparados em tempo real."
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 size-4" /> Nova regra
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="regras">
            Regras <Badge variant="secondary" className="ml-2">{alertas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="disparos">
            Disparos
            {novos > 0 && (
              <Badge variant="destructive" className="ml-2">{novos} novos</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="regras" className="mt-4">
          {alertas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Bell className="mb-3 size-10 text-muted-foreground" />
                <h3 className="text-lg font-medium">Nenhuma regra ainda</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Crie sua primeira regra para receber alertas quando uma tag sair dos limites.
                </p>
                <Button className="mt-4" onClick={openNew}>
                  <Plus className="mr-2 size-4" /> Criar regra
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead>Limites</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertas.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => openEdit(a)}>
                      <TableCell className="font-medium">{a.nome}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{labelTipo(a.tipo)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.tag_nome ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {a.tipo === "tag_stale"
                          ? `${a.stale_minutes} min`
                          : `${a.min_val ?? "—"} / ${a.max_val ?? "—"}`}
                      </TableCell>
                      <TableCell>
                        <Badge className={SEV_COLOR[a.severidade]} variant="outline">{a.severidade}</Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch checked={a.ativo} onCheckedChange={() => toggleAtivo(a)} />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => remove(a)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="disparos" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="novo">Novos</SelectItem>
                <SelectItem value="visto">Vistos</SelectItem>
                <SelectItem value="resolvido">Resolvidos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredDisparos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum disparo {statusFilter !== "todos" ? `com status "${statusFilter}"` : ""}.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Alerta</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDisparos.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(d.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-medium">{d.alerta_nome}</TableCell>
                      <TableCell>
                        <Badge className={SEV_COLOR[d.severidade]} variant="outline">{d.severidade}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{d.mensagem}</TableCell>
                      <TableCell>
                        <StatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {d.status === "novo" && (
                          <Button variant="ghost" size="sm" onClick={() => marcarVisto(d)}>
                            <Eye className="mr-1 size-4" /> Visto
                          </Button>
                        )}
                        {d.status !== "resolvido" && (
                          <Button variant="ghost" size="sm" onClick={() => resolver(d)}>
                            <Check className="mr-1 size-4" /> Resolver
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Form dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input
                value={form.nome ?? ""}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Temperatura forno acima de 200°C"
              />
            </div>

            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={form.descricao ?? ""}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tag_min_max">Tag fora dos limites</SelectItem>
                    <SelectItem value="tag_stale">Tag sem atualização</SelectItem>
                    <SelectItem value="custom">Personalizado (via automação)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Severidade</Label>
                <Select
                  value={form.severidade}
                  onValueChange={(v) => setForm({ ...form, severidade: v as Severidade })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warn">Atenção</SelectItem>
                    <SelectItem value="critical">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(form.tipo === "tag_min_max" || form.tipo === "tag_stale") && (
              <div className="grid gap-2">
                <Label>Tag</Label>
                <Select
                  value={form.tag_nome ?? ""}
                  onValueChange={(v) => setForm({ ...form, tag_nome: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione uma tag" /></SelectTrigger>
                  <SelectContent>
                    {tagOptions.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.tipo === "tag_min_max" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Mínimo</Label>
                  <Input
                    type="number"
                    value={form.min_val ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, min_val: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Máximo</Label>
                  <Input
                    type="number"
                    value={form.max_val ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, max_val: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            )}

            {form.tipo === "tag_stale" && (
              <div className="grid gap-2">
                <Label>Disparar após (minutos sem atualização)</Label>
                <Input
                  type="number"
                  value={form.stale_minutes ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, stale_minutes: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Cooldown (min)</Label>
                <Input
                  type="number"
                  value={form.cooldown_minutes ?? 5}
                  onChange={(e) =>
                    setForm({ ...form, cooldown_minutes: Number(e.target.value || 0) })
                  }
                />
                <p className="text-xs text-muted-foreground">Evita reenviar o mesmo alerta repetidamente.</p>
              </div>
              <div className="grid gap-2">
                <Label className="invisible">.</Label>
                <div className="flex items-center justify-between rounded-md border p-2">
                  <span className="text-sm">Ativo</span>
                  <Switch
                    checked={form.ativo ?? true}
                    onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-2">
                  <span className="text-sm">Notificar por email</span>
                  <Switch
                    checked={form.notificar_email ?? false}
                    onCheckedChange={(v) => setForm({ ...form, notificar_email: v })}
                  />
                </div>
              </div>
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

function StatusBadge({ status }: { status: Disparo["status"] }) {
  if (status === "novo")
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" />novo</Badge>;
  if (status === "visto")
    return <Badge variant="secondary">visto</Badge>;
  return <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">resolvido</Badge>;
}

function labelTipo(t: string) {
  if (t === "tag_min_max") return "Limites";
  if (t === "tag_stale") return "Sem atualização";
  if (t === "custom") return "Personalizado";
  return t;
}
