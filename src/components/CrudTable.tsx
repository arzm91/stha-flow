import { useState, type ReactNode } from "react";
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

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "checkbox" | "select" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
  step?: string;
  placeholder?: string;
};

type Row = Record<string, unknown> & { id: string };

export function CrudTable({
  table, title, description, columns, fields, initialValues,
  searchKeys = ["nome", "codigo"],
  extraActions,
  emptyAction,
}: {
  table: string;
  title: string;
  description?: string;
  columns: { key: string; label: string; render?: (r: Row) => ReactNode }[];
  fields: FieldDef[];
  initialValues: Record<string, unknown>;
  searchKeys?: string[];
  extraActions?: (r: Row) => ReactNode;
  emptyAction?: ReactNode;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(initialValues);

  const list = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await supabase.from(table as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });

  const filtered = (list.data ?? []).filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(s));
  });

  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const payload: Record<string, unknown> = { ...values, owner_id: u.user.id };
      // Normalize empties
      for (const k of Object.keys(payload)) {
        if (payload[k] === "") payload[k] = null;
      }
      if (editing) {
        const { error } = await supabase.from(table as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Registro atualizado" : "Registro criado");
      qc.invalidateQueries({ queryKey: [table] });
      setOpen(false); setEditing(null); setForm(initialValues);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro removido");
      qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(initialValues); setOpen(true); };
  const openEdit = (r: Row) => {
    setEditing(r);
    const next: Record<string, unknown> = {};
    for (const f of fields) next[f.key] = r[f.key] ?? initialValues[f.key];
    setForm(next);
    setOpen(true);
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Novo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar" : "Novo registro"}</DialogTitle>
                <DialogDescription>Preencha os campos abaixo.</DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-3">
                {fields.map((f) => (
                  <div className="space-y-1.5" key={f.key}>
                    <Label htmlFor={f.key}>{f.label}{f.required ? " *" : ""}</Label>
                    {f.type === "checkbox" ? (
                      <div className="flex items-center gap-2">
                        <input id={f.key} type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} className="h-4 w-4 accent-primary" />
                        <span className="text-sm text-muted-foreground">Marcar para ativar</span>
                      </div>
                    ) : f.type === "select" ? (
                      <select id={f.key} value={(form[f.key] as string) ?? ""} required={f.required}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                        <option value="">— selecione —</option>
                        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea id={f.key} value={(form[f.key] as string) ?? ""} required={f.required}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                    ) : (
                      <Input id={f.key} type={f.type ?? "text"} step={f.step} required={f.required}
                        placeholder={f.placeholder}
                        value={(form[f.key] as string | number) ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} />
                    )}
                  </div>
                ))}
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
        <EmptyState title="Nenhum registro" description="Cadastre o primeiro registro para começar." action={emptyAction ?? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Novo</Button>} />
      ) : (
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.key === "codigo" ? "font-mono" : ""}>
                      {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {extraActions ? extraActions(r) : null}
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
