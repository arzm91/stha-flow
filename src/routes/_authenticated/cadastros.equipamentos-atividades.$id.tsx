import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/cadastros/equipamentos-atividades/$id")({
  component: EquipAtividadesPage,
});

type Tipo = "materia_prima" | "processo" | "acao" | "tag_captura" | "medicao";
type Op = "gt" | "lt" | "gte" | "lte" | "eq" | "neq" | "change" | "cross_up" | "cross_down";
type Gatilho = { tipo: "inicio" | "fim"; tag_nome: string; operador: Op; valor: string };
type QtdModo = "fixa" | "tag_valor" | "tag_diferenca";
type CapturaModo = "na_execucao" | "gatilho_valor";
type ModoExecucao = "ordem" | "continuo";

type AtividadeRow = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: Tipo;
  ativo: boolean;
  modo_execucao: ModoExecucao;
  tempo_estimado_min: number | null;
  unidade: string | null;
  quantidade: number | null;
  tag_nome: string | null;
  gatilhos: Gatilho[];
  qtd_modo: QtdModo;
  qtd_tag_nome: string | null;
  captura_modo: CapturaModo;
  captura_gatilho: { operador: Op; valor: string } | null;
  estab_enabled: boolean;
  estab_pct: number;
  estab_janela_seg: number;
  estab_min_estavel_seg: number;
  ordem: number;
  cor: string | null;
};

type Form = {
  id?: string;
  nome: string;
  descricao: string;
  tipo: Tipo;
  ativo: boolean;
  modo_execucao: ModoExecucao;
  tempo_estimado_min: string;
  unidade: string;
  tag_nome: string;
  gatilhos: Gatilho[];
  qtd_modo: QtdModo;
  qtd_tag_nome: string;
  captura_modo: CapturaModo;
  captura_operador: Op;
  captura_valor: string;
  estab_enabled: boolean;
  estab_pct: string;
  estab_janela_seg: string;
  estab_min_estavel_seg: string;
  cor: string;
};

const TIPO_LABEL: Record<Tipo, string> = {
  materia_prima: "Matéria-prima / dosagem",
  processo: "Processo (variação de tag)",
  acao: "Ação / tarefa",
  tag_captura: "Captação de tag",
  medicao: "Medição",
};

const OP_LABEL: Record<Op, string> = {
  gt: "maior que (>)", lt: "menor que (<)",
  gte: "≥", lte: "≤", eq: "=", neq: "≠",
  cross_up: "cruzou para cima (subida atingiu)",
  cross_down: "cruzou para baixo (descida atingiu)",
  change: "qualquer mudança",
};

const COR_PRESETS: Array<{ value: string; label: string }> = [
  { value: "#22c55e", label: "Verde" },
  { value: "#eab308", label: "Amarelo" },
  { value: "#ef4444", label: "Vermelho" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#a855f7", label: "Roxo" },
  { value: "#f97316", label: "Laranja" },
  { value: "#06b6d4", label: "Ciano" },
  { value: "#64748b", label: "Cinza" },
];

function emptyForm(): Form {
  return {
    nome: "", descricao: "", tipo: "acao", ativo: true, modo_execucao: "ordem",
    tempo_estimado_min: "", unidade: "", tag_nome: "", gatilhos: [],
    qtd_modo: "fixa", qtd_tag_nome: "",
    captura_modo: "na_execucao", captura_operador: "gt", captura_valor: "",
    estab_enabled: false, estab_pct: "2", estab_janela_seg: "30", estab_min_estavel_seg: "30",
    cor: "",
  };
}

function EquipAtividadesPage() {
  const { id: equipId } = Route.useParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());

  const equip = useQuery({
    queryKey: ["equip", equipId],
    queryFn: async () => {
      const { data } = await supabase.from("equipamentos").select("id,codigo,nome").eq("id", equipId).maybeSingle();
      return data;
    },
  });

  const tags = useQuery({
    queryKey: ["tags-live-select"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tags_live").select("nome,nome_amigavel,grupo,unidade")
        .order("nome");
      return (data ?? []) as Array<{ nome: string; nome_amigavel: string | null; grupo: string | null; unidade: string | null }>;
    },
  });

  const list = useQuery({
    queryKey: ["equip-atividades", equipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipamento_atividades")
        .select("*")
        .eq("equipamento_id", equipId)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AtividadeRow[];
    },
  });

  function openNew() { setForm(emptyForm()); setOpen(true); }
  function openEdit(r: AtividadeRow) {
    setForm({
      id: r.id,
      nome: r.nome ?? "",
      descricao: r.descricao ?? "",
      tipo: r.tipo,
      ativo: r.ativo,
      modo_execucao: r.modo_execucao,
      tempo_estimado_min: r.tempo_estimado_min?.toString() ?? "",
      unidade: r.unidade ?? "",
      tag_nome: r.tag_nome ?? "",
      gatilhos: Array.isArray(r.gatilhos) ? r.gatilhos : [],
      qtd_modo: r.qtd_modo,
      qtd_tag_nome: r.qtd_tag_nome ?? "",
      captura_modo: r.captura_modo,
      captura_operador: (r.captura_gatilho?.operador ?? "gt") as Op,
      captura_valor: r.captura_gatilho?.valor?.toString() ?? "",
      estab_enabled: r.estab_enabled,
      estab_pct: r.estab_pct?.toString() ?? "2",
      estab_janela_seg: r.estab_janela_seg?.toString() ?? "30",
      estab_min_estavel_seg: r.estab_min_estavel_seg?.toString() ?? "30",
      cor: r.cor ?? "",
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome do evento");
      const payload: Record<string, unknown> = {
        equipamento_id: equipId,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        tipo: form.tipo,
        ativo: form.ativo,
        modo_execucao: form.modo_execucao,
        tempo_estimado_min: form.tempo_estimado_min ? Number(form.tempo_estimado_min) : null,
        unidade: form.unidade.trim() || null,
        tag_nome: form.tipo === "tag_captura" ? (form.tag_nome || null) : null,
        gatilhos: form.gatilhos.filter((g) => g.tag_nome),
        qtd_modo: form.qtd_modo,
        qtd_tag_nome: form.qtd_modo !== "fixa" ? (form.qtd_tag_nome || null) : null,
        captura_modo: form.captura_modo,
        captura_gatilho: form.tipo === "tag_captura" && form.captura_modo === "gatilho_valor"
          ? { operador: form.captura_operador, valor: form.captura_valor } : null,
        estab_enabled: form.estab_enabled,
        estab_pct: Number(form.estab_pct) || 2,
        estab_janela_seg: Number(form.estab_janela_seg) || 30,
        estab_min_estavel_seg: Number(form.estab_min_estavel_seg) || 30,
        cor: form.cor.trim() || null,
      };
      const client = supabase as unknown as { from: (t: string) => { update: (p: unknown) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }; insert: (p: unknown) => Promise<{ error: unknown }> } };
      if (form.id) {
        const { error } = await client.from("equipamento_atividades").update(payload).eq("id", form.id);
        if (error) throw error as Error;
      } else {
        const { error } = await client.from("equipamento_atividades").insert(payload);
        if (error) throw error as Error;
      }
    },
    onSuccess: () => {
      toast.success("Atividade salva");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["equip-atividades", equipId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("equipamento_atividades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atividade removida");
      qc.invalidateQueries({ queryKey: ["equip-atividades", equipId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tagOptions = (tags.data ?? []).map((t) => ({
    value: t.nome,
    label: `${t.nome_amigavel?.trim() || t.nome}${t.grupo ? ` (${t.grupo})` : ""}${t.unidade ? ` · ${t.unidade}` : ""}`,
  }));

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/cadastros/equipamentos"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
      </Button>
      <PageHeader
        title={`Processos por equipamento`}
        description={equip.data ? `${equip.data.codigo} — ${equip.data.nome}. Todas as atividades rodam em paralelo, sem ordem obrigatória.` : ""}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Atividades cadastradas</CardTitle>
          <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" /> Nova atividade</Button>
        </CardHeader>
        <CardContent>
          {(list.data ?? []).length === 0 ? (
            <EmptyState title="Nenhuma atividade" description="Cadastre uma atividade para capturar tags, dosagens e eventos automaticamente." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome do evento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Gatilhos</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data!.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full border"
                          style={{ background: r.cor || "transparent", borderColor: r.cor ? r.cor : "hsl(var(--border))" }}
                          aria-hidden
                        />
                        {r.nome}
                      </span>
                    </TableCell>
                    <TableCell>{TIPO_LABEL[r.tipo]}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.modo_execucao === "continuo" ? "Contínuo" : "Durante ordem"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.gatilhos ?? []).map((g, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">
                            {g.tipo}: {g.tag_nome} {OP_LABEL[g.operador]} {g.operador !== "change" ? g.valor : ""}
                          </Badge>
                        ))}
                        {(!r.gatilhos || r.gatilhos.length === 0) && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>{r.ativo ? "Sim" : "Não"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remover atividade?")) del.mutate(r.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar atividade" : "Nova atividade"}</DialogTitle>
            <DialogDescription>
              O nome informado aqui é o rótulo que aparece no gráfico de acompanhamento.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nome do evento *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Dosagem soda, Aquecimento, Descarga…" />
            </div>

            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(TIPO_LABEL) as [Tipo, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Modo de execução</Label>
                <Select value={form.modo_execucao} onValueChange={(v) => setForm({ ...form, modo_execucao: v as ModoExecucao })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ordem">Só durante ordem de produção</SelectItem>
                    <SelectItem value="continuo">Contínuo (a implementar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Tempo estimado (min)</Label>
                <Input type="number" value={form.tempo_estimado_min}
                  onChange={(e) => setForm({ ...form, tempo_estimado_min: e.target.value })}
                  placeholder="Opcional — encerra após esse tempo" />
              </div>
              <div className="grid gap-2">
                <Label>Unidade</Label>
                <Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="kg, L, °C…" />
              </div>
            </div>

            {form.tipo === "tag_captura" && (
              <div className="grid gap-3 rounded-md border p-3 bg-muted/30">
                <div className="grid gap-2">
                  <Label>Tag a capturar</Label>
                  <Select value={form.tag_nome} onValueChange={(v) => setForm({ ...form, tag_nome: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione a tag" /></SelectTrigger>
                    <SelectContent>
                      {tagOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Quando capturar</Label>
                  <Select value={form.captura_modo} onValueChange={(v) => setForm({ ...form, captura_modo: v as CapturaModo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="na_execucao">Assim que a atividade iniciar (snapshot)</SelectItem>
                      <SelectItem value="gatilho_valor">Quando a tag atingir um valor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.captura_modo === "gatilho_valor" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={form.captura_operador} onValueChange={(v) => setForm({ ...form, captura_operador: v as Op })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(OP_LABEL) as [Op, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Valor" value={form.captura_valor}
                      onChange={(e) => setForm({ ...form, captura_valor: e.target.value })} />
                  </div>
                )}
              </div>
            )}

            {(form.tipo === "materia_prima" || form.tipo === "processo") && (
              <div className="grid gap-3 rounded-md border p-3 bg-muted/30">
                <div className="grid gap-2">
                  <Label>Como obter a quantidade</Label>
                  <Select value={form.qtd_modo} onValueChange={(v) => setForm({ ...form, qtd_modo: v as QtdModo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixa">{form.tipo === "processo" ? "Sem quantidade (só duração)" : "Valor fixo (informado manualmente)"}</SelectItem>
                      <SelectItem value="tag_valor">Valor da tag no encerramento</SelectItem>
                      <SelectItem value="tag_diferenca">Diferença da tag (fim − início)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.qtd_modo !== "fixa" && (
                  <div className="grid gap-2">
                    <Label>{form.tipo === "processo" ? "Tag do processo" : "Tag da dosagem"}</Label>
                    <Select value={form.qtd_tag_nome} onValueChange={(v) => setForm({ ...form, qtd_tag_nome: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione a tag" /></SelectTrigger>
                      <SelectContent>
                        {tagOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(form.qtd_modo === "tag_diferenca" || (form.tipo === "processo" && form.qtd_modo !== "fixa")) && (
                  <div className="grid gap-2 border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={form.estab_enabled}
                        onCheckedChange={(v) => setForm({ ...form, estab_enabled: !!v })} />
                      <Label>Detectar automaticamente início/fim por variação e estabilização</Label>
                    </div>
                    {form.estab_enabled && (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Variação (%)</Label>
                          <Input value={form.estab_pct} onChange={(e) => setForm({ ...form, estab_pct: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Janela (s)</Label>
                          <Input value={form.estab_janela_seg} onChange={(e) => setForm({ ...form, estab_janela_seg: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Estável por (s)</Label>
                          <Input value={form.estab_min_estavel_seg} onChange={(e) => setForm({ ...form, estab_min_estavel_seg: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-md border p-3 bg-muted/30 grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Gatilhos por tag (opcionais)</Label>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" type="button"
                    onClick={() => setForm({ ...form, gatilhos: [...form.gatilhos, { tipo: "inicio", tag_nome: "", operador: "gt", valor: "" }] })}>
                    + início
                  </Button>
                  <Button size="sm" variant="outline" type="button"
                    onClick={() => setForm({ ...form, gatilhos: [...form.gatilhos, { tipo: "fim", tag_nome: "", operador: "gt", valor: "" }] })}>
                    + fim
                  </Button>
                </div>
              </div>
              {form.gatilhos.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Sem gatilhos: inicia junto com a ordem e encerra pelo tempo estimado ou snapshot da tag.
                </p>
              )}
              {form.gatilhos.map((g, i) => (
                <div key={i} className="grid grid-cols-[80px_1fr_120px_100px_32px] gap-2 items-center">
                  <Badge variant="outline">{g.tipo}</Badge>
                  <Select value={g.tag_nome} onValueChange={(v) => {
                    const arr = [...form.gatilhos]; arr[i] = { ...arr[i], tag_nome: v }; setForm({ ...form, gatilhos: arr });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Tag" /></SelectTrigger>
                    <SelectContent>
                      {tagOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={g.operador} onValueChange={(v) => {
                    const arr = [...form.gatilhos]; arr[i] = { ...arr[i], operador: v as Op }; setForm({ ...form, gatilhos: arr });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(OP_LABEL) as [Op, string][]).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={g.valor} disabled={g.operador === "change"}
                    onChange={(e) => {
                      const arr = [...form.gatilhos]; arr[i] = { ...arr[i], valor: e.target.value }; setForm({ ...form, gatilhos: arr });
                    }} placeholder="valor" />
                  <Button variant="ghost" size="icon" type="button"
                    onClick={() => setForm({ ...form, gatilhos: form.gatilhos.filter((_, k) => k !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="rounded-md border p-3 bg-muted/30 grid gap-2">
              <Label className="text-sm">Cor no acompanhamento</Label>
              <p className="text-[11px] text-muted-foreground">
                Usada para identificar visualmente este processo no acompanhamento da produção.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {COR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setForm({ ...form, cor: c.value })}
                    className={`h-7 w-7 rounded-full border-2 ${form.cor.toLowerCase() === c.value.toLowerCase() ? "border-foreground" : "border-transparent"}`}
                    style={{ background: c.value }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, cor: "" })}
                  className={`h-7 rounded-full border px-2 text-[11px] ${!form.cor ? "border-foreground" : "border-border"}`}
                >
                  sem cor
                </button>
                <Input
                  value={form.cor}
                  onChange={(e) => setForm({ ...form, cor: e.target.value })}
                  placeholder="#hex"
                  className="h-7 w-28 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: !!v })} />
              <Label>Ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
