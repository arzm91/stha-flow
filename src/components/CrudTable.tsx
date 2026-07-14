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
import { requireAdminPassword } from "@/components/admin-password/AdminPasswordGate";
import { useResourcePermissions, type ResourceType } from "@/hooks/useResourcePermissions";

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "checkbox" | "select" | "textarea" | "multiselect" | "chips";
  required?: boolean;
  options?: { value: string; label: string; hint?: string }[];
  step?: string;
  placeholder?: string;
  help?: string;
  /** When set, renders a section heading + divider before this field. */
  section?: string;
};


type Row = Record<string, unknown> & { id: string };

export function CrudTable({
  table, title, description, columns, fields, initialValues,
  searchKeys = ["nome", "codigo"],
  extraActions,
  emptyAction,
  resourceType,
  filter,
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
  /** When set, filters list rows to those allowed for the current user. */
  resourceType?: ResourceType;
  /** Optional equality filter applied both to the list query and merged into inserts/updates. */
  filter?: Record<string, unknown>;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(initialValues);
  const resPerms = useResourcePermissions();

  const filterKey = JSON.stringify(filter ?? {});
  const list = useQuery({
    queryKey: [table, filterKey],
    queryFn: async () => {
      let q: any = supabase.from(table as never).select("*").order("created_at", { ascending: false });
      if (filter) {
        for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });

  const visible = resourceType ? resPerms.filter(resourceType, list.data) : (list.data ?? []);
  const filtered = visible.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(s));
  });


  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const payload: Record<string, unknown> = { ...values, ...(filter ?? {}), owner_id: u.user.id };
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
            <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar" : "Novo registro"}</DialogTitle>
                <DialogDescription>Preencha os campos abaixo.</DialogDescription>
              </DialogHeader>
              <form onSubmit={async (e) => { e.preventDefault(); if (editing && !(await requireAdminPassword(`editar este registro de ${title.toLowerCase()}`))) return; save.mutate(form); }} className="space-y-3">
                {fields.map((f) => (
                  <div className="space-y-1.5" key={f.key}>
                    {f.section ? (
                      <div className="mb-1 mt-3 border-t border-border/60 pt-3">
                        <h3 className="text-sm font-semibold text-foreground">{f.section}</h3>
                      </div>
                    ) : null}
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
                    ) : f.type === "multiselect" ? (
                      <MultiSelectField
                        value={Array.isArray(form[f.key]) ? (form[f.key] as string[]) : []}
                        onChange={(v) => setForm({ ...form, [f.key]: v })}
                        options={f.options ?? []}
                        placeholder={f.placeholder ?? "Selecione..."}
                      />
                    ) : f.type === "chips" ? (
                      <ChipsField
                        value={Array.isArray(form[f.key]) ? (form[f.key] as string[]) : []}
                        onChange={(v) => setForm({ ...form, [f.key]: v })}
                        placeholder={f.placeholder ?? "Digite e pressione Enter"}
                      />
                    ) : (
                      <Input id={f.key} type={f.type ?? "text"} step={f.step} required={f.required}
                        placeholder={f.placeholder}
                        value={(form[f.key] as string | number) ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} />
                    )}
                    {f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
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
                      <Button variant="ghost" size="icon" onClick={async () => { if (!confirm("Confirma a exclusão?")) return; if (!(await requireAdminPassword(`excluir este registro de ${title.toLowerCase()}`))) return; remove.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
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

function MultiSelectField({
  value, onChange, options, placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string; hint?: string }[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  const filtered = options.filter((o) =>
    !query ||
    o.label.toLowerCase().includes(query.toLowerCase()) ||
    o.value.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-2 rounded-md border border-input bg-background p-2">
      <Input placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => (
            <button type="button" key={v} onClick={() => toggle(v)}
              className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary hover:bg-primary/25">
              {v} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-48 overflow-auto rounded border border-border">
        {filtered.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">Nenhuma tag encontrada.</p>
        ) : filtered.map((o) => {
          const checked = value.includes(o.value);
          return (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-muted/50">
              <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} className="h-4 w-4 accent-primary" />
              <span className="flex-1 truncate font-mono text-xs">{o.label}</span>
              {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ChipsField({
  value, onChange, placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (value.includes(v)) { setInput(""); return; }
    onChange([...value, v]);
    setInput("");
  };
  const remove = (v: string) => onChange(value.filter((x) => x !== v));
  return (
    <div className="space-y-2 rounded-md border border-input bg-background p-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="h-8"
        />
        <Button type="button" size="sm" variant="secondary" onClick={add}>Adicionar</Button>
      </div>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => (
            <button type="button" key={v} onClick={() => remove(v)}
              className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary hover:bg-primary/25">
              {v} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum item. Digite e pressione Enter ou clique em Adicionar.</p>
      )}
    </div>
  );
}

