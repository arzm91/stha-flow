import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, LineChart as LineChartIcon, X, Download, Upload } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { SheetColumn } from "@/lib/tabelas/types";
import { evalTabelaFormula } from "@/lib/tabelas/formula";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export const Route = createFileRoute("/_authenticated/tabelas/$id")({
  head: pageHead({ title: "Tabelas · Detalhes — STHApc", description: "Visualize detalhes no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: (params) => `/tabelas/${params.id}` }),
  component: TabelaDetail,
});

type Row = {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
};

function TabelaDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { canEdit } = usePagePermissions();
  const editable = canEdit("tabelas");
  const [open, setOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterCol, setFilterCol] = useState<string>("__created_at__");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      return data as unknown as Row[];
    },
  });

  const { data: tagsLive = [] } = useQuery({
    queryKey: ["tags-live-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags_live").select("nome, valor_num");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000,
  });
  const tagsMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tagsLive as { nome: string; valor_num: number | null }[]) {
      if (t.valor_num != null) m.set(t.nome, Number(t.valor_num));
    }
    return m;
  }, [tagsLive]);

  const deleteRow = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("custom_sheet_rows").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Linha excluída");
      qc.invalidateQueries({ queryKey: ["custom_sheet_rows", id] });
    },
    onError: async (e: Error) => {
      toast.error(e.message);
    },
  });

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Planilha vazia");
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (json.length === 0) throw new Error("Nenhuma linha encontrada");
      const cols = (sheet?.columns as SheetColumn[] | undefined) ?? [];
      const byLabel = new Map(cols.map((c) => [c.label.toLowerCase().trim(), c]));
      const byKey = new Map(cols.map((c) => [c.key.toLowerCase().trim(), c]));
      const payloads = json.map((row) => {
        const data: Record<string, unknown> = {};
        for (const [rawKey, rawVal] of Object.entries(row)) {
          const k = String(rawKey).toLowerCase().trim();
          const col = byLabel.get(k) ?? byKey.get(k);
          if (!col) continue;
          if (rawVal === "" || rawVal === null || rawVal === undefined) {
            data[col.key] = null;
            continue;
          }
          if (col.type === "number") {
            const n = Number(rawVal);
            data[col.key] = isNaN(n) ? null : n;
          } else if (col.type === "boolean") {
            const s = String(rawVal).toLowerCase().trim();
            data[col.key] = s === "true" || s === "sim" || s === "1" || s === "yes";
          } else if (col.type === "date") {
            if (rawVal instanceof Date) {
              const y = rawVal.getFullYear();
              const m = String(rawVal.getMonth() + 1).padStart(2, "0");
              const d = String(rawVal.getDate()).padStart(2, "0");
              data[col.key] = `${y}-${m}-${d}`;
            } else {
              const s = String(rawVal).trim();
              const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
              data[col.key] = br ? `${br[3]}-${br[2]}-${br[1]}` : s;
            }
          } else {
            data[col.key] = String(rawVal);
          }
        }
        return {
          sheet_id: id,
          data: data as never,
          owner_id: u.user!.id,
          created_by: u.user!.id,
        };
      });
      const { error } = await supabase.from("custom_sheet_rows").insert(payloads as never);
      if (error) throw error;
      return payloads.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} registro(s) importado(s)`);
      qc.invalidateQueries({ queryKey: ["custom_sheet_rows", id] });
    },
    onError: (e: Error) => toast.error(`Falha ao importar: ${e.message}`),
  });

  const columns = (sheet?.columns as SheetColumn[] | undefined) ?? [];

  const computeCell = (col: SheetColumn, data: Record<string, unknown>): unknown => {
    if (col.formula && col.formula.trim()) {
      const scope: Record<string, number> = {};
      for (const c of columns) {
        const v = data[c.key];
        if (typeof v === "number") scope[c.key] = v;
        else if (typeof v === "string" && v !== "" && !isNaN(Number(v))) scope[c.key] = Number(v);
      }
      for (const [nome, val] of tagsMap.entries()) scope[nome] = val;
      const r = evalTabelaFormula(col.formula, scope);
      if (r != null) return r;
    }
    if (col.type !== "number" && col.tagNome) {
      const v = tagsMap.get(col.tagNome);
      if (v != null && data[col.key] == null) return v;
    }
    return data[col.key];
  };

  const exportExcel = () => {
    const cols = columns;
    const data = filteredRows.map((r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const c of cols) {
        const v = computeCell(c, d);
        if (c.type === "date" && typeof v === "string") {
          const dt = parseDateSafe(v);
          out[c.label] = dt ? dt.toLocaleDateString("pt-BR") : v;
        } else if (c.type === "boolean") {
          out[c.label] = v ? "Sim" : "Não";
        } else {
          out[c.label] = v ?? "";
        }
      }
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: cols.map((c) => c.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    const safe = (sheet?.nome ?? "tabela").replace(/[^a-zA-Z0-9-_]+/g, "_");
    XLSX.writeFile(wb, `${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };



  const dateColumns = columns.filter((c) => c.type === "date");
  const numericColumns = columns.filter((c) => c.type === "number");

  const filteredRows = useMemo(() => {
    if (!dateFrom && !dateTo) return rows;
    const from = dateFrom ? dateFrom : null;
    const to = dateTo ? dateTo : null;
    return rows.filter((r) => {
      let val: string | null = null;
      if (filterCol === "__created_at__") {
        val = r.created_at.slice(0, 10);
      } else {
        const raw = r.data?.[filterCol];
        val = typeof raw === "string" ? raw.slice(0, 10) : null;
      }
      if (!val) return false;
      if (from && val < from) return false;
      if (to && val > to) return false;
      return true;
    });
  }, [rows, dateFrom, dateTo, filterCol]);

  if (!sheet) {
    return (
      <div>
        <PageHeader title="Carregando..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={sheet.nome}
        description={sheet.descricao ?? undefined}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" asChild>
              <Link to="/tabelas">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
              </Link>
            </Button>
            {numericColumns.length > 0 && (
              <Button variant="outline" onClick={() => setChartOpen(true)}>
                <LineChartIcon className="mr-2 h-4 w-4" /> Gráfico
              </Button>
            )}
            <Button variant="outline" onClick={exportExcel}>
              <Download className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
            {editable && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importMut.mutate(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importMut.isPending}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {importMut.isPending ? "Importando..." : "Importar Excel"}
                </Button>
              </>
            )}
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

      {/* Filtros por data */}
      <Card className="mb-3">
        <CardContent className="py-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Filtrar por</Label>
            <Select value={filterCol} onValueChange={setFilterCol}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__created_at__">Data de criação</SelectItem>
                {dateColumns.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[160px]"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Limpar
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredRows.length} de {rows.length} registros
          </span>
        </CardContent>
      </Card>

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
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nenhum registro.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const d = r.data as Record<string, unknown>;
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={`px-3 py-2 align-top ${editable ? "cursor-pointer" : ""}`}
                          onClick={() => editable && setEditingRow(r)}
                          title={editable ? "Clique para editar" : undefined}
                        >
                          {formatCell(computeCell(c, d), c.type)}{c.formula ? <span className="ml-1 text-[10px] text-muted-foreground align-super">fx</span> : null}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        {editable && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
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

      {editingRow && (
        <Dialog open={!!editingRow} onOpenChange={(o) => !o && setEditingRow(null)}>
          <RowDialog
            sheetId={id}
            columns={columns}
            initial={editingRow}
            tagsMap={tagsMap}
            onSaved={() => setEditingRow(null)}
          />
        </Dialog>
      )}

      {chartOpen && (
        <Dialog open={chartOpen} onOpenChange={setChartOpen}>
          <ChartDialog
            rows={filteredRows}
            columns={columns}
            sheetName={sheet.nome}
            computeCell={computeCell}
          />
        </Dialog>
      )}
    </div>
  );
}

function parseDateSafe(val: string): Date | null {
  // Treat YYYY-MM-DD as local date (avoid UTC shift that pushes to previous day)
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(val);
  return isNaN(dt.getTime()) ? null : dt;
}

function formatCell(val: unknown, type: SheetColumn["type"]) {
  if (val === null || val === undefined || val === "") return "—";
  if (type === "boolean") return val ? "Sim" : "Não";
  if (type === "date" && typeof val === "string") {
    const d = parseDateSafe(val);
    return d ? d.toLocaleDateString("pt-BR") : String(val);
  }
  return String(val);
}

function RowDialog({
  sheetId,
  columns,
  initial,
  onSaved,
}: {
  sheetId: string;
  columns: SheetColumn[];
  initial?: Row;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (initial) {
      const out: Record<string, unknown> = {};
      for (const c of columns) {
        const v = initial.data?.[c.key];
        out[c.key] = c.type === "boolean" ? !!v : (v ?? "");
      }
      return out;
    }
    return Object.fromEntries(
      columns.map((c) => [c.key, c.type === "boolean" ? false : ""]),
    );
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const payload: Record<string, unknown> = {};
      for (const c of columns) {
        const v = values[c.key];
        if (c.type === "number" && v !== "" && v !== null && v !== undefined) {
          payload[c.key] = Number(v);
        } else if (c.type === "boolean") {
          payload[c.key] = !!v;
        } else {
          // dates stored as plain YYYY-MM-DD string (no timezone conversion)
          payload[c.key] = v === "" ? null : v;
        }
      }
      if (isEdit && initial) {
        const { error } = await supabase
          .from("custom_sheet_rows")
          .update({ data: payload as never })
          .eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("custom_sheet_rows").insert({
          sheet_id: sheetId,
          data: payload as never,
          owner_id: u.user.id,
          created_by: u.user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Registro atualizado" : "Registro salvo");
      qc.invalidateQueries({ queryKey: ["custom_sheet_rows", sheetId] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
      <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
        <DialogTitle>{isEdit ? "Editar registro" : "Novo registro"}</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
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
                  type={
                    c.type === "number"
                      ? "number"
                      : c.type === "date"
                        ? "date"
                        : "text"
                  }
                  step={c.type === "number" ? "any" : undefined}
                  value={String(values[c.key] ?? "")}
                  onChange={(e) =>
                    setValues((s) => ({ ...s, [c.key]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button type="submit" disabled={saveMut.isPending}>
            {isEdit ? "Salvar alterações" : "Salvar"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ChartDialog({
  rows,
  columns,
  sheetName,
}: {
  rows: Row[];
  columns: SheetColumn[];
  sheetName: string;
}) {
  const numericColumns = columns.filter((c) => c.type === "number");
  const dateColumns = columns.filter((c) => c.type === "date");
  const [xKey, setXKey] = useState<string>(
    dateColumns[0]?.key ?? "__created_at__",
  );
  const [yKeys, setYKeys] = useState<string[]>(
    numericColumns.length ? [numericColumns[0].key] : [],
  );

  const data = useMemo(() => {
    const out = rows
      .map((r) => {
        const d = r.data as Record<string, unknown>;
        let x: string;
        if (xKey === "__created_at__") {
          x = r.created_at.slice(0, 10);
        } else {
          const raw = d[xKey];
          x = typeof raw === "string" ? raw.slice(0, 10) : "";
        }
        const point: Record<string, unknown> = { x };
        for (const k of yKeys) {
          const v = d[k];
          point[k] = typeof v === "number" ? v : v == null ? null : Number(v);
        }
        return point;
      })
      .filter((p) => p.x)
      .sort((a, b) => String(a.x).localeCompare(String(b.x)));
    return out;
  }, [rows, xKey, yKeys]);

  const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

  const toggleY = (key: string) => {
    setYKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
      <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
        <DialogTitle>Gráfico — {sheetName}</DialogTitle>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Eixo X (data)</Label>
            <Select value={xKey} onValueChange={setXKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__created_at__">Data de criação</SelectItem>
                {dateColumns.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Séries (valores numéricos)</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {numericColumns.map((c) => (
                <Button
                  key={c.key}
                  type="button"
                  size="sm"
                  variant={yKeys.includes(c.key) ? "default" : "outline"}
                  onClick={() => toggleY(c.key)}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              {data.length} pontos
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            {data.length === 0 || yKeys.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Selecione ao menos uma série e verifique os filtros de data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="x" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  {yKeys.map((k, i) => {
                    const col = numericColumns.find((c) => c.key === k);
                    return (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={col?.label ?? k}
                        stroke={colors[i % colors.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </DialogContent>
  );
}
