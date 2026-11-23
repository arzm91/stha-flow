import { pageHead } from "@/lib/seo";
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
import { Pencil, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { useResourcePermissions } from "@/hooks/useResourcePermissions";


export const Route = createFileRoute("/_authenticated/cadastros/produtos")({
  head: pageHead({ title: "Cadastros · Produtos — STHApc", description: "Acesse e gerencie Cadastros · Produtos no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: "/cadastros/produtos" }),
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
  concentracao: number | null;
  equipamento_id: string | null;
  tag_clp: string | null;
  tag_valor_ativacao: number | null;
  tag_total_producao: string | null;
};

const emptyProduto = { codigo: "", nome: "", descricao: "", unidade: "", categoria: "", ativo: true, concentracao: "", equipamento_id: "", tag_clp: "", tag_valor_ativacao: "", tag_total_producao: "" };

function ProdutosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [form, setForm] = useState<typeof emptyProduto>(emptyProduto);
  type ReceitaItem = { id?: string; materia_prima_id: string; percentual: string; tag_consumo_nome: string };
  const [receita, setReceita] = useState<ReceitaItem[]>([]);

  const list = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Produto[]) ?? [];
    },
  });

  // tags disponíveis (capturadas dos endpoints)
  const tagsList = useQuery({
    queryKey: ["tags-live-nomes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live")
        .select("nome, nome_amigavel, grupo, unidade")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ nome: string; nome_amigavel: string | null; grupo: string | null; unidade: string | null }>;
    },
  });


  const equipList = useQuery({
    queryKey: ["equipamentos", "produto-vinculo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("id, codigo, nome").eq("categoria", "producao").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const resPerms = useResourcePermissions();
  const visible = resPerms.filter("produto", list.data).filter((p) => p.categoria !== "materia_prima");
  const filtered = visible.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [r.nome, r.codigo, r.categoria ?? ""].some((v) => v.toLowerCase().includes(s));
  });

  // MPs available for recipe
  const mpList = useQuery({
    queryKey: ["materias-primas-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos")
        .select("id, codigo, nome, unidade, tag_consumo")
        .eq("categoria", "materia_prima").eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string; unidade: string; tag_consumo: string | null }[];
    },
  });


  const openCreate = () => {
    setEditing(null);
    setForm(emptyProduto);
    setReceita([]);
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
      concentracao: r.concentracao == null ? "" : String(r.concentracao),
      equipamento_id: r.equipamento_id ?? "",
      tag_clp: r.tag_clp ?? "",
      tag_valor_ativacao: r.tag_valor_ativacao == null ? "" : String(r.tag_valor_ativacao),
      tag_total_producao: r.tag_total_producao ?? "",
    });

    // Load recipe
    const { data: rec } = await supabase.from("produto_receita")
      .select("id, materia_prima_id, percentual, tag_consumo_nome, ordem")
      .eq("produto_id", r.id).order("ordem");
    setReceita(((rec ?? []) as Array<{ id: string; materia_prima_id: string; percentual: number | null; tag_consumo_nome: string | null }>).map((x) => ({
      id: x.id,
      materia_prima_id: x.materia_prima_id,
      percentual: x.percentual == null ? "" : String(x.percentual),
      tag_consumo_nome: x.tag_consumo_nome ?? "",
    })));

    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const ownerId = u.user.id;
      const payload = {
        ...form,
        descricao: form.descricao || null,
        categoria: form.categoria || null,
        concentracao: form.concentracao === "" ? null : Number(form.concentracao),
        equipamento_id: form.equipamento_id || null,
        tag_clp: form.tag_clp || null,
        tag_valor_ativacao: form.tag_valor_ativacao === "" ? null : Number(form.tag_valor_ativacao),
        tag_total_producao: form.tag_total_producao || null,
        owner_id: ownerId,
      };
      if (payload.tag_clp && (payload.tag_valor_ativacao == null || !payload.equipamento_id)) {
        throw new Error("Para vincular a tag do CLP, escolha o equipamento e o valor (0 ou 1).");
      }

      let produtoId = editing?.id;
      if (editing) {
        const { owner_id: _o, ...upd } = payload;
        const { error } = await supabase.from("produtos").update(upd).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("produtos").insert(payload).select("id").single();
        if (error) throw error;
        produtoId = data.id;
      }
      if (!produtoId) throw new Error("Falha ao salvar produto");

      // Save recipe (replace all items for this product)
      const recValid = receita.filter((r) => r.materia_prima_id);
      const total = recValid.reduce((s, r) => s + (Number(r.percentual) || 0), 0);
      if (recValid.length > 0 && Math.round(total * 100) / 100 > 100.01) {
        throw new Error(`A soma das porcentagens da receita é ${total.toFixed(2)}%. Não pode ultrapassar 100%.`);
      }
      const { error: delErr } = await supabase.from("produto_receita").delete().eq("produto_id", produtoId);
      if (delErr) throw delErr;
      if (recValid.length > 0) {
        const rows = recValid.map((r, idx) => ({
          produto_id: produtoId!,
          materia_prima_id: r.materia_prima_id,
          percentual: Number(r.percentual) || 0,
          tag_consumo_nome: r.tag_consumo_nome.trim() || null,
          ordem: idx,
          owner_id: u.user.id,
        }));
        const { error: insErr } = await supabase.from("produto_receita").insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Produto atualizado" : "Produto criado");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyProduto);
      setReceita([]);
    },
    onError: async (e: Error & { code?: string; details?: string; hint?: string }) => {
      const raw = (e?.message || "") + " " + (e?.details || "");
      let friendly = e.message;
      if (e.code === "23503" || /foreign key|violates|forgrei/i.test(raw)) {
        friendly =
          "Não foi possível salvar porque este produto está vinculado a ordens de produção, alertas ou outros registros. " +
          "Suas alterações no formulário foram preservadas — feche, finalize/remova o vínculo apontado e tente novamente.";
      } else if (e.code === "23505") {
        friendly = "Já existe um registro com esse código. Use um código diferente.";
      } else if (e.code === "23514") {
        friendly = "Algum campo está com valor inválido. Revise os campos destacados.";
      }
      toast.error(friendly, { duration: 8000 });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido");
      qc.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: async (e: Error) => {
      toast.error(e.message);
    },
  });

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro de produtos e da receita de matérias-primas. Os processos de fabricação
            são cadastrados por equipamento em <span className="font-medium">Cadastros &gt; Equipamentos &gt; Processos</span>.
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
            <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
                <DialogDescription>
                  Defina os dados do produto e a receita de matérias-primas.
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
                  <Field label="Concentração / parâmetro (%)">
                    <Input type="number" step="0.01" min="0" max="100" placeholder="ex.: 50" value={form.concentracao} onChange={(e) => setForm({ ...form, concentracao: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2 space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <div>
                      <h3 className="text-sm font-semibold">Identificação pela tag do CLP</h3>
                      <p className="text-xs text-muted-foreground">Este produto está em produção no equipamento quando a tag tiver o valor escolhido. Ex.: tag X = 1 → este produto.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Field label="Equipamento">
                        <select value={form.equipamento_id} onChange={(e) => setForm({ ...form, equipamento_id: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                          <option value="">— nenhum —</option>
                          {(equipList.data ?? []).map((q) => <option key={q.id} value={q.id}>{q.codigo} — {q.nome}</option>)}
                        </select>
                      </Field>
                      <Field label="Tag do CLP (0/1)">
                        <select value={form.tag_clp} onChange={(e) => setForm({ ...form, tag_clp: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                          <option value="">— nenhuma —</option>
                          {(tagsList.data ?? []).map((t) => <option key={t.nome} value={t.nome}>{t.nome_amigavel || t.nome}</option>)}
                        </select>
                      </Field>
                      <Field label="Produto quando a tag for">
                        <select value={form.tag_valor_ativacao} onChange={(e) => setForm({ ...form, tag_valor_ativacao: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                          <option value="">— selecione —</option>
                          <option value="0">0</option>
                          <option value="1">1</option>
                        </select>
                      </Field>
                      <Field label="Tag de total do produto (já totalizada)">
                        <select value={form.tag_total_producao} onChange={(e) => setForm({ ...form, tag_total_producao: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                          <option value="">— sem tag —</option>
                          {(tagsList.data ?? []).map((t) => <option key={t.nome} value={t.nome}>{t.nome_amigavel || t.nome}</option>)}
                        </select>
                      </Field>
                    </div>
                  </div>
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

                {/* ==== RECEITA (matérias-primas por %) ==== */}
                <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Receita — matérias-primas</h3>
                      <p className="text-xs text-muted-foreground">
                        Defina o percentual de cada MP para 100% do produto. Opcionalmente, associe uma tag de consumo — se a tag estiver disponível na ordem, o valor real da tag é usado; caso contrário, a baixa usa o percentual informado.
                      </p>
                    </div>
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => setReceita((p) => [...p, { materia_prima_id: "", percentual: "", tag_consumo_nome: "" }])}
                    >
                      <Plus className="mr-1 h-4 w-4" /> MP
                    </Button>
                  </div>

                  {receita.length === 0 ? (
                    <p className="rounded border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
                      Nenhuma matéria-prima adicionada. Cadastre as MPs em Cadastros → Matérias-primas.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {receita.map((r, ri) => (
                        <div key={ri} className="grid grid-cols-12 gap-2 rounded-md border border-border bg-background p-2 items-center">
                          {ri === 0 ? <div className="col-span-12 text-[10px] font-medium text-primary">Matéria-prima principal — base do índice de conversão</div> : null}
                          <select
                            value={r.materia_prima_id}
                            onChange={(ev) => { const mp = (mpList.data ?? []).find((m) => m.id === ev.target.value); setReceita((prev) => prev.map((x, i) => i === ri ? { ...x, materia_prima_id: ev.target.value, tag_consumo_nome: mp?.tag_consumo || x.tag_consumo_nome } : x)); }}
                            className="col-span-5 h-9 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="">— Selecione MP —</option>
                            {(mpList.data ?? []).map((m) => (
                              <option key={m.id} value={m.id}>{m.codigo} — {m.nome} ({m.unidade})</option>
                            ))}
                          </select>
                          <div className="col-span-2 flex items-center gap-1">
                            <Input
                              type="number" step="0.01" min="0" max="100"
                              value={r.percentual}
                              onChange={(ev) => setReceita((prev) => prev.map((x, i) => i === ri ? { ...x, percentual: ev.target.value } : x))}
                              placeholder="%" className="h-9"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <select
                            value={r.tag_consumo_nome}
                            onChange={(ev) => setReceita((prev) => prev.map((x, i) => i === ri ? { ...x, tag_consumo_nome: ev.target.value } : x))}
                            className="col-span-4 h-9 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="">Sem tag (usa %)</option>
                            {(tagsList.data ?? []).map((t) => (
                              <option key={t.nome} value={t.nome}>{t.nome_amigavel || t.nome}</option>
                            ))}
                          </select>
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="col-span-1"
                            onClick={() => setReceita((prev) => prev.filter((_, i) => i !== ri))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex justify-end text-xs text-muted-foreground">
                        Soma: {receita.reduce((s, r) => s + (Number(r.percentual) || 0), 0).toFixed(2)}% (não pode passar de 100%)
                      </div>
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
                <TableHead>Concentração</TableHead>
                <TableHead>Tag CLP</TableHead>
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
                  <TableCell>{r.concentracao != null ? `${r.concentracao}%` : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.tag_clp ? `${r.tag_clp} = ${r.tag_valor_ativacao ?? "?"}` : "—"}</TableCell>
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
