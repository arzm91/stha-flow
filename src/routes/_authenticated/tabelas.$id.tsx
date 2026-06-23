import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import type { SheetColumn } from "@/lib/tabelas/types";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export const Route = createFileRoute("/_authenticated/tabelas/$id")({
  component: TabelaDetail,
});

function TabelaDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { canEdit } = usePagePermissions();
  const editable = canEdit("tabelas");
  const [open, setOpen] = useState(false);

  const { data: sheet } = useQuery({
    queryKey: ["custom_sheet", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_sheets")
        .select("id, nome, descricao, columns")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["custom_sheet_rows", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_sheet_rows")
        .select("id, data, created_at")
        .eq("sheet_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteRow = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("custom_sheet_rows").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Linha excluída");
      qc.invalidateQueries({ queryKey: ["custom_sheet_rows", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!sheet) {
    return (
      <div>
        <PageHeader title="Carregando..." />
      </div>
    );
  }

  const columns = sheet.columns as SheetColumn[];

  return (
    <div>
      <PageHeader
        title={sheet.nome}
        description={sheet.descricao ?? undefined}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/tabelas">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
              </Link>
            </Button>
            {editable && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Novo registro
                  </Button>
                </DialogTrigger>
                <RowDialog
                  sheetId={id}
                  columns={columns}
                  onSaved={() => setOpen(false)}
                />
              </Dialog>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-left font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nenhum registro ainda.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const d = r.data as Record<string, unknown>;
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-2 align-top">
                          {formatCell(d[c.key], c.type)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        {editable && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Excluir registro?")) deleteRow.mutate(r.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function formatCell(val: unknown, type: SheetColumn["type"]) {
  if (val === null || val === undefined || val === "") return "—";
  if (type === "boolean") return val ? "Sim" : "Não";
  if (type === "date" && typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString("pt-BR");
  }
  return String(val);
}

function RowDialog({
  sheetId,
  columns,
  onSaved,
}: {
  sheetId: string;
  columns: SheetColumn[];
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.type === "boolean" ? false : ""])),
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const payload: Record<string, unknown> = {};
      for (const c of columns) {
        const v = values[c.key];
        if (c.type === "number" && v !== "" && v !== null && v !== undefined) {
          payload[c.key] = Number(v);
        } else {
          payload[c.key] = v ?? null;
        }
      }
      const { error } = await supabase.from("custom_sheet_rows").insert({
        sheet_id: sheetId,
        data: payload as never,
        owner_id: u.user.id,
        created_by: u.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro salvo");
      qc.invalidateQueries({ queryKey: ["custom_sheet_rows", sheetId] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo registro</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="space-y-3"
      >
        {columns.map((c) => (
          <div key={c.key} className="space-y-1.5">
            <Label>{c.label}</Label>
            {c.type === "boolean" ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={!!values[c.key]}
                  onCheckedChange={(v) =>
                    setValues((s) => ({ ...s, [c.key]: !!v }))
                  }
                />
                <span className="text-sm text-muted-foreground">Sim</span>
              </div>
            ) : (
              <Input
                type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"}
                step={c.type === "number" ? "any" : undefined}
                value={String(values[c.key] ?? "")}
                onChange={(e) =>
                  setValues((s) => ({ ...s, [c.key]: e.target.value }))
                }
              />
            )}
          </div>
        ))}
        <DialogFooter>
          <Button type="submit" disabled={saveMut.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
