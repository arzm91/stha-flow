import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Table as TableIcon, Pencil } from "lucide-react";
import type { SheetColumn, ColumnType } from "@/lib/tabelas/types";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useResourcePermissions } from "@/hooks/useResourcePermissions";


export const Route = createFileRoute("/_authenticated/tabelas/")({
  component: TabelasIndex,
});

type SheetRow = {
  id: string;
  nome: string;
  descricao: string | null;
  columns: SheetColumn[];
  updated_at: string;
};

function TabelasIndex() {
  const qc = useQueryClient();
  const { canEdit } = usePagePermissions();
  const resPerms = useResourcePermissions();
  const editable = canEdit("tabelas");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SheetRow | null>(null);

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ["custom_sheets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_sheets")
        .select("id, nome, descricao, columns, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SheetRow[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { guardAdmin } = await import("@/lib/security/guard-admin");
      await guardAdmin("excluir esta tabela");
      const { error } = await supabase.from("custom_sheets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tabela excluída");
      qc.invalidateQueries({ queryKey: ["custom_sheets"] });
    },
    onError: async (e: Error) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (!isAdminCancelled(e)) toast.error(e.message);
    },
  });

  return (
    <div>
      <PageHeader
        title="Tabelas"
        description="Crie tabelas personalizadas para registros de campo, análises e qualquer dado livre."
        actions={
          editable && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Nova tabela
                </Button>
              </DialogTrigger>
              <SheetFormDialog mode="create" onDone={() => setOpen(false)} />
            </Dialog>
          )
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (() => {
        const visibleSheets = resPerms.filter("custom_sheet", sheets);
        if (visibleSheets.length === 0) {
          return (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {sheets.length === 0
                  ? "Nenhuma tabela criada ainda."
                  : "Nenhuma tabela liberada para você. Peça ao administrador para liberar o acesso."}
              </CardContent>
            </Card>
          );
        }
        return (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSheets.map((s) => (

            <Card key={s.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/tabelas/$id" params={{ id: s.id }} className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TableIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{s.nome}</span>
                    </CardTitle>
                  </Link>
                  {editable && (
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(s)}
                        title="Editar tabela"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Excluir "${s.nome}" e todas as linhas?`))
                            deleteMut.mutate(s.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Link to="/tabelas/$id" params={{ id: s.id }} className="block">
                  {s.descricao && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {s.descricao}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {(s.columns as SheetColumn[]).length} colunas
                  </p>
                </Link>
              </CardContent>
            </Card>
            ))}
          </div>
        );
      })()}


      {editing && (
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <SheetFormDialog
            mode="edit"
            initial={editing}
            onDone={() => setEditing(null)}
          />
        </Dialog>
      )}
    </div>
  );
}

function SheetFormDialog({
  mode,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  initial?: SheetRow;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [columns, setColumns] = useState<SheetColumn[]>(
    initial?.columns ?? [{ key: "col1", label: "Coluna 1", type: "text" }],
  );

  const addCol = () =>
    setColumns((c) => [
      ...c,
      {
        key: `col${Date.now()}`,
        label: `Coluna ${c.length + 1}`,
        type: "text",
      },
    ]);
  const updateCol = (i: number, patch: Partial<SheetColumn>) =>
    setColumns((c) => c.map((col, idx) => (idx === i ? { ...col, ...patch } : col)));
  const removeCol = (i: number) =>
    setColumns((c) => c.filter((_, idx) => idx !== i));

  const saveMut = useMutation({
    mutationFn: async () => {
      const cleaned = columns
        .filter((c) => c.label.trim())
        .map((c, i) => ({
          key: c.key || `col${i + 1}`,
          label: c.label.trim(),
          type: c.type,
        }));
      if (cleaned.length === 0) throw new Error("Adicione ao menos uma coluna");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      if (mode === "create") {
        const { error } = await supabase.from("custom_sheets").insert({
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          columns: cleaned as never,
          owner_id: u.user.id,
        });
        if (error) throw error;
      } else if (initial) {
        const { error } = await supabase
          .from("custom_sheets")
          .update({
            nome: nome.trim(),
            descricao: descricao.trim() || null,
            columns: cleaned as never,
          })
          .eq("id", initial.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Tabela criada" : "Tabela atualizada");
      qc.invalidateQueries({ queryKey: ["custom_sheets"] });
      if (initial) qc.invalidateQueries({ queryKey: ["custom_sheet", initial.id] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0">
      <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
        <DialogTitle>{mode === "create" ? "Nova tabela" : "Editar tabela"}</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da tabela</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Análise de óleo - bombas"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Colunas (cabeçalho)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addCol}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar coluna
              </Button>
            </div>
            {columns.map((col, i) => (
              <div
                key={col.key + i}
                className="grid grid-cols-[1fr_130px_auto] gap-2 items-center"
              >
                <Input
                  value={col.label}
                  onChange={(e) => updateCol(i, { label: e.target.value })}
                  placeholder="Nome da coluna"
                />
                <Select
                  value={col.type}
                  onValueChange={(v) => updateCol(i, { type: v as ColumnType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="date">Data</SelectItem>
                    <SelectItem value="boolean">Sim/Não</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCol(i)}
                  disabled={columns.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {mode === "edit" && (
              <p className="text-xs text-muted-foreground">
                Alterar/remover colunas não apaga dados antigos das linhas — apenas
                deixa de exibi-los.
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button type="submit" disabled={saveMut.isPending}>
            {mode === "create" ? "Criar tabela" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
