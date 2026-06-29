import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Trash2, Search, ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/cadastros/produtos")({
  component: ProdutosPage,
});

type Produto = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  unidade: string;
  categoria: string | null;
  ativo: boolean;
};

type Atividade = {
  id?: string;
  descricao: string;
  tipo: "materia_prima" | "medicao" | "acao" | "tag_captura";
  quantidade: string;
  unidade: string;
  tempo_estimado_min: string;
  tag_nome: string;
};

type Processo = {
  id?: string;
  nome: string;
  expanded: boolean;
  tempo_limite_min: string;
  atividades: Atividade[];
};

const TIPO_LABEL: Record<Atividade["tipo"], string> = {
  materia_prima: "Matéria-prima",
  medicao: "Medição",
  acao: "Ação",
  tag_captura: "Captação de tag",
};

const emptyProduto = { codigo: "", nome: "", descricao: "", unidade: "", categoria: "", ativo: true };

function newAtividade(): Atividade {
  return { descricao: "", tipo: "acao", quantidade: "", unidade: "", tempo_estimado_min: "", tag_nome: "" };
}

function ProdutosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [form, setForm] = useState<typeof emptyProduto>(emptyProduto);
  const [processos, setProcessos] = useState<Processo[]>([]);

  const list = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Produto[]) ?? [];
    },
  });

  // counts per produto
  const counts = useQuery({
    queryKey: ["produtos-processos-count"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produto_processos").select("produto_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { produto_id: string }[]) map[r.produto_id] = (map[r.produto_id] ?? 0) + 1;
      return map;
    },
  });

  const filtered = (list.data ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [r.nome, r.codigo, r.categoria ?? ""].some((v) => v.toLowerCase().includes(s));
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyProduto);
    setProcessos([]);
    setOpen(true);
  };

  const openEdit = async (r: Produto) => {
    setEditing(r);
    setForm({
      codigo: r.codigo,
      nome: r.nome,
      descricao: r.descricao ?? "",
      unidade: r.unidade,
      categoria: r.categoria ?? "",
      ativo: r.ativo,
    });
    // load existing processes + activities
    const { data: procs } = await supabase
      .from("produto_processos")
      .select("id, nome, ordem")
      .eq("produto_id", r.id)
      .order("ordem", { ascending: true });
    const procIds = (procs ?? []).map((p) => p.id);
    const { data: ativs } = procIds.length
      ? await supabase
          .from("produto_atividades")
          .select("id, processo_id, descricao, ordem, tipo, quantidade, unidade, tempo_estimado_min")
          .in("processo_id", procIds)
          .order("ordem", { ascending: true })
      : { data: [] };
    const byProc: Record<string, Atividade[]> = {};
    for (const a of (ativs ?? []) as Array<{
      id: string; processo_id: string; descricao: string; tipo: Atividade["tipo"];
      quantidade: number | null; unidade: string | null; tempo_estimado_min: number | null;
    }>) {
      (byProc[a.processo_id] ??= []).push({
        id: a.id,
        descricao: a.descricao,
        tipo: a.tipo,
        quantidade: a.quantidade == null ? "" : String(a.quantidade),
        unidade: a.unidade ?? "",
        tempo_estimado_min: a.tempo_estimado_min == null ? "" : String(a.tempo_estimado_min),
      });
    }
    setProcessos(
      (procs ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        expanded: true,
        atividades: byProc[p.id] ?? [],
      })),
    );
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      if (editing) {
        const { guardAdmin } = await import("@/lib/security/guard-admin");
        await guardAdmin(`editar o produto "${editing.nome}"`);
      }
      const ownerId = u.user.id;
      const payload = {
        ...form,
        descricao: form.descricao || null,
        categoria: form.categoria || null,
        owner_id: ownerId,
      };

      let produtoId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("produtos").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("produtos").insert(payload).select("id").single();
        if (error) throw error;
        produtoId = data.id;
      }
      if (!produtoId) throw new Error("Falha ao salvar produto");

      // Replace processes (cascade clears activities)
      const { error: delErr } = await supabase.from("produto_processos").delete().eq("produto_id", produtoId);
      if (delErr) throw delErr;

      for (let i = 0; i < processos.length; i++) {
        const p = processos[i];
        if (!p.nome.trim()) continue;
        const { data: procIns, error: procErr } = await supabase
          .from("produto_processos")
          .insert({ owner_id: ownerId, produto_id: produtoId, nome: p.nome.trim(), ordem: i })
          .select("id")
          .single();
        if (procErr) throw procErr;
        const ativsToInsert = p.atividades
          .filter((a) => a.descricao.trim())
          .map((a, idx) => ({
            owner_id: ownerId,
            processo_id: procIns.id,
            descricao: a.descricao.trim(),
            ordem: idx,
            tipo: a.tipo,
            quantidade: a.quantidade === "" ? null : Number(a.quantidade),
            unidade: a.unidade || null,
            tempo_estimado_min: a.tempo_estimado_min === "" ? null : Number(a.tempo_estimado_min),
          }));
        if (ativsToInsert.length) {
          const { error: ativErr } = await supabase.from("produto_atividades").insert(ativsToInsert);
          if (ativErr) throw ativErr;
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Produto atualizado" : "Produto criado");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-processos-count"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyProduto);
      setProcessos([]);
    },
    onError: async (e: Error) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (!isAdminCancelled(e)) toast.error(e.message);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { guardAdmin } = await import("@/lib/security/guard-admin");
      await guardAdmin("excluir este produto");
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-processos-count"] });
    },
    onError: async (e: Error) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (!isAdminCancelled(e)) toast.error(e.message);
    },
  });

  // process/activity editors
  const addProcesso = () =>
    setProcessos((prev) => [...prev, { nome: "", expanded: true, atividades: [newAtividade()] }]);
  const updateProcesso = (i: number, patch: Partial<Processo>) =>
    setProcessos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const removeProcesso = (i: number) =>
    setProcessos((prev) => prev.filter((_, idx) => idx !== i));
  const moveProcesso = (i: number, dir: -1 | 1) =>
    setProcessos((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addAtividade = (pi: number) =>
    updateProcesso(pi, { atividades: [...processos[pi].atividades, newAtividade()] });
  const updateAtividade = (pi: number, ai: number, patch: Partial<Atividade>) =>
    updateProcesso(pi, {
      atividades: processos[pi].atividades.map((a, idx) => (idx === ai ? { ...a, ...patch } : a)),
    });
  const removeAtividade = (pi: number, ai: number) =>
    updateProcesso(pi, { atividades: processos[pi].atividades.filter((_, idx) => idx !== ai) });

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro de produtos com processos e atividades de fabricação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
                <DialogDescription>
                  Defina os dados do produto e o passo a passo de fabricação.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate();
                }}
                className="space-y-5"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Código *">
                    <Input required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                  </Field>
                  <Field label="Nome *">
                    <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                  </Field>
                  <Field label="Unidade *">
                    <Input required placeholder="kg, L, un..." value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
                  </Field>
                  <Field label="Categoria">
                    <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Descrição">
                      <textarea
                        value={form.descricao}
                        onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                        className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </Field>
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <input
                      id="ativo"
                      type="checkbox"
                      checked={form.ativo}
                      onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                      className="h-4 w-4 accent-primary"
                    />
                    <Label htmlFor="ativo">Ativo</Label>
                  </div>
                </div>

                <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Processos de fabricação</h3>
                      <p className="text-xs text-muted-foreground">Agrupe atividades em etapas ordenadas.</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={addProcesso}>
                      <Plus className="mr-1 h-4 w-4" /> Processo
                    </Button>
                  </div>

                  {processos.length === 0 ? (
                    <p className="rounded border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
                      Nenhum processo adicionado.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {processos.map((p, pi) => (
                        <div key={pi} className="rounded-md border border-border bg-background">
                          <div className="flex items-center gap-2 border-b border-border p-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => updateProcesso(pi, { expanded: !p.expanded })}
                            >
                              {p.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                            <span className="text-xs font-mono text-muted-foreground">{pi + 1}.</span>
                            <Input
                              value={p.nome}
                              onChange={(e) => updateProcesso(pi, { nome: e.target.value })}
                              placeholder="Nome do processo (ex.: Preparação)"
                              className="h-8"
                            />
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => moveProcesso(pi, -1)} disabled={pi === 0}>↑</Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => moveProcesso(pi, 1)} disabled={pi === processos.length - 1}>↓</Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeProcesso(pi)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {p.expanded ? (
                            <div className="space-y-2 p-2">
                              {p.atividades.length === 0 ? (
                                <p className="px-1 text-xs text-muted-foreground">Sem atividades.</p>
                              ) : (
                                p.atividades.map((a, ai) => (
                                  <div key={ai} className="grid grid-cols-12 gap-2 rounded border border-border/60 p-2">
                                    <div className="col-span-12 sm:col-span-5">
                                      <Input
                                        value={a.descricao}
                                        onChange={(e) => updateAtividade(pi, ai, { descricao: e.target.value })}
                                        placeholder="Descrição da atividade"
                                        className="h-8"
                                      />
                                    </div>
                                    <div className="col-span-6 sm:col-span-2">
                                      <select
                                        value={a.tipo}
                                        onChange={(e) => updateAtividade(pi, ai, { tipo: e.target.value as Atividade["tipo"] })}
                                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                      >
                                        <option value="acao">Ação</option>
                                        <option value="materia_prima">Matéria-prima</option>
                                        <option value="medicao">Medição</option>
                                      </select>
                                    </div>
                                    <div className="col-span-3 sm:col-span-1">
                                      <Input
                                        type="number"
                                        step="0.001"
                                        value={a.quantidade}
                                        onChange={(e) => updateAtividade(pi, ai, { quantidade: e.target.value })}
                                        placeholder="Qtd"
                                        className="h-8"
                                      />
                                    </div>
                                    <div className="col-span-3 sm:col-span-1">
                                      <Input
                                        value={a.unidade}
                                        onChange={(e) => updateAtividade(pi, ai, { unidade: e.target.value })}
                                        placeholder="un"
                                        className="h-8"
                                      />
                                    </div>
                                    <div className="col-span-9 sm:col-span-2">
                                      <Input
                                        type="number"
                                        value={a.tempo_estimado_min}
                                        onChange={(e) => updateAtividade(pi, ai, { tempo_estimado_min: e.target.value })}
                                        placeholder="Tempo (min)"
                                        className="h-8"
                                      />
                                    </div>
                                    <div className="col-span-3 flex justify-end sm:col-span-1">
                                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeAtividade(pi, ai)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))
                              )}
                              <Button type="button" size="sm" variant="ghost" onClick={() => addAtividade(pi)}>
                                <Plus className="mr-1 h-4 w-4" /> Atividade
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={save.isPending}>{editing ? "Salvar" : "Criar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {list.data && list.data.length === 0 ? (
        <EmptyState
          title="Nenhum produto"
          description="Cadastre o primeiro produto para começar."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Novo</Button>}
        />
      ) : (
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Processos</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.codigo}</TableCell>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell>{r.unidade}</TableCell>
                  <TableCell>{r.categoria ?? "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
                      <ListChecks className="h-3 w-3" />
                      {counts.data?.[r.id] ?? 0}
                    </span>
                  </TableCell>
                  <TableCell>{r.ativo ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Confirma a exclusão?")) remove.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
