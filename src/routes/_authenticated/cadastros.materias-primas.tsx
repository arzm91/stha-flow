import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Trash2, Search, Wheat } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/cadastros/materias-primas")({
  component: MateriasPrimasPage,
});

type MP = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  unidade: string;
  categoria: string | null;
  ativo: boolean;
};

const empty = { codigo: "", nome: "", descricao: "", unidade: "kg", ativo: true };

function MateriasPrimasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MP | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);

  const list = useQuery({
    queryKey: ["materias-primas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos")
        .select("*").eq("categoria", "materia_prima")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as MP[]) ?? [];
    },
  });

  const usage = useQuery({
    queryKey: ["materias-primas-usage"],
    queryFn: async () => {
      const { data } = await supabase.from("produto_receita").select("materia_prima_id");
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as { materia_prima_id: string }[]) {
        m[r.materia_prima_id] = (m[r.materia_prima_id] ?? 0) + 1;
      }
      return m;
    },
  });

  const filtered = (list.data ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [r.nome, r.codigo].some((v) => v.toLowerCase().includes(s));
  });

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (r: MP) => {
    setEditing(r);
    setForm({
      codigo: r.codigo, nome: r.nome, descricao: r.descricao ?? "",
      unidade: r.unidade, ativo: r.ativo,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const payload = {
        codigo: form.codigo.trim(),
        nome: form.nome.trim(),
        descricao: form.descricao || null,
        unidade: form.unidade || "kg",
        categoria: "materia_prima",
        ativo: form.ativo,
        owner_id: u.user.id,
      };
      if (!payload.codigo || !payload.nome) throw new Error("Código e nome são obrigatórios");
      if (editing) {
        const { error } = await supabase.from("produtos").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("produtos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Matéria-prima atualizada" : "Matéria-prima cadastrada");
      qc.invalidateQueries({ queryKey: ["materias-primas"] });
      qc.invalidateQueries({ queryKey: ["materias-primas-list"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = async (r: MP) => {
    if ((usage.data ?? {})[r.id]) {
      return toast.error("Matéria-prima está em uso em alguma receita. Remova-a das receitas antes.");
    }
    if (!confirm(`Remover "${r.nome}"?`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    qc.invalidateQueries({ queryKey: ["materias-primas"] });
  };

  return (
    <div>
      <PageHeader
        title="Matérias-primas"
        description="Insumos usados nas receitas de produtos. Cada MP tem código, unidade e pode ser armazenada em tanques como um produto qualquer."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nova matéria-prima</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar matéria-prima" : "Nova matéria-prima"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Código</Label>
                  <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Unidade</Label>
                  <Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="kg, L, un..." />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Descrição</Label>
                  <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
                </div>
                <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                  Ativa
                </label>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-3 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome ou código" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {list.data && filtered.length === 0 ? (
        <EmptyState
          icon={<Wheat className="h-6 w-6" />}
          title="Nenhuma matéria-prima cadastrada"
          description="Cadastre insumos para poder montar receitas nos produtos finais e provisionar automaticamente nas ordens de produção."
        />
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Usada em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell>{r.unidade}</TableCell>
                  <TableCell>{(usage.data ?? {})[r.id] ?? 0} receita(s)</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.ativo ? "bg-success/20 text-success border-success/30" : "bg-muted"}>
                      {r.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
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
