import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRows, loadEquipamentos, loadProdutos } from "@/lib/relatorios/fetch";
import { aggregate, aggLabel } from "@/lib/relatorios/aggregate";
import { sourceFor, SOURCES_BY_FONTE, FONTE_LABEL } from "@/lib/relatorios/sources";
import type {
  Aggregation, AggregationOp, ChartConfig, ColumnDef, FiltersValue, Fonte,
  ReportConfig, SourceKey,
} from "@/lib/relatorios/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { ReportPreview } from "./ReportPreview";
import { ExportMenu } from "./ExportMenu";

type Props = {
  initialFonte?: Fonte;
  initialSource?: SourceKey;
  initialConfig?: ReportConfig;
  initialName?: string;
  initialDescription?: string;
  onSave?: (payload: { nome: string; descricao: string; fonte: Fonte; source: SourceKey; config: ReportConfig }) => Promise<void> | void;
  canEdit: boolean;
  mode: "create" | "edit" | "run";
};

const AGG_OPS: { value: AggregationOp; label: string }[] = [
  { value: "sum", label: "Soma" },
  { value: "avg", label: "Média" },
  { value: "count", label: "Contagem" },
  { value: "min", label: "Mínimo" },
  { value: "max", label: "Máximo" },
];

function defaultConfig(source: SourceKey): ReportConfig {
  const s = sourceFor(source);
  return {
    source,
    columns: s.columns.slice(0, Math.min(8, s.columns.length)).map((c) => c.key),
    filters: {},
    groupBy: [],
    aggregations: [],
    chart: { enabled: false, type: "bar" },
  };
}

export function ReportBuilder(props: Props) {
  const [fonte, setFonte] = useState<Fonte>(props.initialFonte ?? "producao");
  const [source, setSource] = useState<SourceKey>(props.initialSource ?? "producao.etapas");
  const [config, setConfig] = useState<ReportConfig>(props.initialConfig ?? defaultConfig(source));
  const [nome, setNome] = useState(props.initialName ?? "");
  const [descricao, setDescricao] = useState(props.initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // If source changes and no initial config was passed, reset config
  useEffect(() => {
    if (config.source !== source) setConfig(defaultConfig(source));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const srcDef = sourceFor(source);

  const equipQ = useQuery({ queryKey: ["rel:equipamentos"], queryFn: loadEquipamentos, staleTime: 60_000 });
  const prodQ = useQuery({ queryKey: ["rel:produtos"], queryFn: loadProdutos, staleTime: 60_000 });

  const dataQ = useQuery({
    queryKey: ["rel:data", source, config.filters],
    queryFn: () => fetchRows(source, config.filters),
    staleTime: 15_000,
  });

  const rows = dataQ.data ?? [];
  const aggregated = useMemo(
    () => aggregate(rows, config.groupBy, config.aggregations),
    [rows, config.groupBy, config.aggregations],
  );

  const displayColumns = useMemo<ColumnDef[]>(() => {
    if (config.groupBy.length) {
      const groupCols = config.groupBy
        .map((k) => srcDef.columns.find((c) => c.key === k))
        .filter(Boolean) as ColumnDef[];
      const aggCols: ColumnDef[] = config.aggregations.map((a) => ({
        key: aggLabel(a), label: aggLabel(a), type: "number", numeric: true,
      }));
      return [...groupCols, ...aggCols];
    }
    return config.columns
      .map((k) => srcDef.columns.find((c) => c.key === k))
      .filter(Boolean) as ColumnDef[];
  }, [config, srcDef]);

  const displayRows = config.groupBy.length ? aggregated.rows : rows;

  function toggleColumn(k: string) {
    setConfig((c) => ({
      ...c,
      columns: c.columns.includes(k) ? c.columns.filter((x) => x !== k) : [...c.columns, k],
    }));
  }
  function moveColumn(k: string, dir: -1 | 1) {
    setConfig((c) => {
      const cols = [...c.columns];
      const i = cols.indexOf(k);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cols.length) return c;
      [cols[i], cols[j]] = [cols[j], cols[i]];
      return { ...c, columns: cols };
    });
  }

  function setFilter<K extends keyof FiltersValue>(key: K, value: FiltersValue[K]) {
    setConfig((c) => ({ ...c, filters: { ...c.filters, [key]: value || null } }));
  }

  function toggleGroupBy(k: string) {
    setConfig((c) => {
      const has = c.groupBy.includes(k);
      let g = has ? c.groupBy.filter((x) => x !== k) : [...c.groupBy, k];
      if (g.length > 2) g = g.slice(-2);
      return { ...c, groupBy: g };
    });
  }

  function addAggregation() {
    const numericCol = srcDef.columns.find((c) => c.numeric);
    setConfig((c) => ({
      ...c,
      aggregations: [...c.aggregations, { column: numericCol?.key ?? srcDef.columns[0].key, op: "sum" }],
    }));
  }
  function updateAgg(i: number, patch: Partial<Aggregation>) {
    setConfig((c) => ({
      ...c,
      aggregations: c.aggregations.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    }));
  }
  function removeAgg(i: number) {
    setConfig((c) => ({ ...c, aggregations: c.aggregations.filter((_, idx) => idx !== i) }));
  }

  function updateChart(patch: Partial<ChartConfig>) {
    setConfig((c) => ({ ...c, chart: { ...c.chart, ...patch } }));
  }

  async function handleSave() {
    if (!props.onSave || !nome.trim()) return;
    setSaving(true);
    try {
      await props.onSave({ nome: nome.trim(), descricao: descricao.trim(), fonte, source, config });
    } finally {
      setSaving(false);
    }
  }

  const filtroLabels: Array<[string, string]> = [];
  if (config.filters.data_de) filtroLabels.push(["De", new Date(config.filters.data_de).toLocaleDateString("pt-BR")]);
  if (config.filters.data_ate) filtroLabels.push(["Até", new Date(config.filters.data_ate).toLocaleDateString("pt-BR")]);
  if (config.filters.equipamento_id) {
    const e = equipQ.data?.find((x) => x.id === config.filters.equipamento_id);
    if (e) filtroLabels.push(["Equipamento", e.nome]);
  }
  if (config.filters.produto_id) {
    const p = prodQ.data?.find((x) => x.id === config.filters.produto_id);
    if (p) filtroLabels.push(["Produto", p.nome]);
  }
  if (config.filters.status) filtroLabels.push(["Status", config.filters.status]);
  if (config.filters.tipo) filtroLabels.push(["Tipo", config.filters.tipo]);
  if (config.filters.prioridade) filtroLabels.push(["Prioridade", config.filters.prioridade]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
      {/* --- Config panel --- */}
      <div className="space-y-4 print:hidden">
        {(props.mode === "create" || props.mode === "edit") && (
          <Card className="space-y-3 p-4">
            <div>
              <Label>Nome do relatório</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Produção diária por equipamento" disabled={!props.canEdit} />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!props.canEdit} />
            </div>
          </Card>
        )}

        {props.mode !== "run" && (
          <Card className="space-y-3 p-4">
            <div>
              <Label>Categoria</Label>
              <Select value={fonte} onValueChange={(v) => { const nv = v as Fonte; setFonte(nv); setSource(SOURCES_BY_FONTE[nv][0].key); }} disabled={!props.canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FONTE_LABEL) as Fonte[]).map((k) => (
                    <SelectItem key={k} value={k}>{FONTE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fonte de dados</Label>
              <Select value={source} onValueChange={(v) => setSource(v as SourceKey)} disabled={!props.canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES_BY_FONTE[fonte].map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{srcDef.description}</p>
            </div>
          </Card>
        )}

        <Card className="space-y-3 p-4">
          <div className="text-sm font-semibold">Filtros</div>
          {srcDef.filters.map((f) => {
            if (f.key === "date_range") {
              return (
                <div key="date" className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">{f.label} — de</Label>
                    <Input type="date" value={config.filters.data_de ?? ""} onChange={(e) => setFilter("data_de", e.target.value || null)} />
                  </div>
                  <div>
                    <Label className="text-xs">até</Label>
                    <Input type="date" value={config.filters.data_ate ?? ""} onChange={(e) => setFilter("data_ate", e.target.value || null)} />
                  </div>
                </div>
              );
            }
            if (f.key === "select_equipamento") {
              return (
                <div key="eq">
                  <Label className="text-xs">{f.label}</Label>
                  <Select value={config.filters.equipamento_id ?? "__all"} onValueChange={(v) => setFilter("equipamento_id", v === "__all" ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">Todos</SelectItem>
                      {equipQ.data?.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            if (f.key === "select_produto") {
              return (
                <div key="prod">
                  <Label className="text-xs">{f.label}</Label>
                  <Select value={config.filters.produto_id ?? "__all"} onValueChange={(v) => setFilter("produto_id", v === "__all" ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">Todos</SelectItem>
                      {prodQ.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            if (f.key === "select_status" || f.key === "select_tipo" || f.key === "select_prioridade") {
              const kind = f.key === "select_status" ? "status" : f.key === "select_tipo" ? "tipo" : "prioridade";
              // Options derived from currently loaded rows
              const opts = Array.from(new Set(rows.map((r) => String(r[f.appliesTo ?? kind] ?? "")).filter(Boolean)));
              return (
                <div key={kind}>
                  <Label className="text-xs">{f.label}</Label>
                  <Select value={(config.filters[kind] ?? "__all") as string} onValueChange={(v) => setFilter(kind, v === "__all" ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">Todos</SelectItem>
                      {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            return null;
          })}
        </Card>

        {props.mode !== "run" && (
          <Card className="space-y-2 p-4">
            <div className="text-sm font-semibold">Colunas ({config.columns.length})</div>
            <div className="max-h-72 space-y-1 overflow-auto pr-1">
              {srcDef.columns.map((c) => {
                const active = config.columns.includes(c.key);
                return (
                  <div key={c.key} className="flex items-center gap-2 rounded border border-border/50 px-2 py-1">
                    <Checkbox checked={active} onCheckedChange={() => toggleColumn(c.key)} disabled={!props.canEdit} />
                    <span className="flex-1 text-xs">{c.label}</span>
                    {active && props.canEdit && (
                      <>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveColumn(c.key, -1)}><ArrowUp className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveColumn(c.key, 1)}><ArrowDown className="h-3 w-3" /></Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {props.mode !== "run" && (
          <Card className="space-y-3 p-4">
            <div className="text-sm font-semibold">Agrupar e agregar</div>
            <div>
              <Label className="text-xs">Agrupar por (até 2)</Label>
              <div className="flex flex-wrap gap-1">
                {srcDef.columns.filter((c) => !c.numeric).map((c) => (
                  <Badge key={c.key} variant={config.groupBy.includes(c.key) ? "default" : "outline"}
                    className="cursor-pointer" onClick={() => props.canEdit && toggleGroupBy(c.key)}>
                    {c.label}
                  </Badge>
                ))}
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Agregações</Label>
                {props.canEdit && <Button size="sm" variant="outline" onClick={addAggregation}><Plus className="mr-1 h-3 w-3" />Adicionar</Button>}
              </div>
              {config.aggregations.map((a, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Select value={a.op} onValueChange={(v) => updateAgg(i, { op: v as AggregationOp })} disabled={!props.canEdit}>
                    <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{AGG_OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={a.column} onValueChange={(v) => updateAgg(i, { column: v })} disabled={!props.canEdit}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {srcDef.columns.map((c) => (
                        <SelectItem key={c.key} value={c.key} disabled={a.op !== "count" && !c.numeric}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {props.canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => removeAgg(i)}><Trash2 className="h-3 w-3" /></Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {props.mode !== "run" && (
          <Card className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <Checkbox checked={config.chart.enabled} onCheckedChange={(v) => updateChart({ enabled: !!v })} disabled={!props.canEdit} />
              <div className="text-sm font-semibold">Mostrar gráfico</div>
            </div>
            {config.chart.enabled && (
              <div className="space-y-2">
                <Select value={config.chart.type} onValueChange={(v) => updateChart({ type: v as ChartConfig["type"] })} disabled={!props.canEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Barras</SelectItem>
                    <SelectItem value="line">Linha</SelectItem>
                    <SelectItem value="pie">Pizza</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">O gráfico usa o 1º agrupamento (eixo X) e a 1ª agregação (eixo Y).</p>
              </div>
            )}
          </Card>
        )}

        {(props.mode === "create" || props.mode === "edit") && props.canEdit && (
          <Button className="w-full" onClick={handleSave} disabled={!nome.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar relatório
          </Button>
        )}
      </div>

      {/* --- Preview --- */}
      <div ref={previewRef} className="space-y-3">
        <div className="flex items-center justify-between print:hidden">
          <div className="text-sm text-muted-foreground">
            {dataQ.isFetching ? "Carregando..." : `${displayRows.length} linha(s)`}
          </div>
          <ExportMenu
            name={nome || srcDef.label}
            fonteLabel={FONTE_LABEL[fonte]}
            filtros={filtroLabels}
            columns={displayColumns}
            rows={displayRows}
            chartEnabled={config.chart.enabled}
            previewRef={previewRef}
          />
        </div>
        {dataQ.error && <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{(dataQ.error as Error).message}</div>}
        <ReportPreview
          title={nome || srcDef.label}
          fonteLabel={FONTE_LABEL[fonte]}
          filtros={filtroLabels}
          columns={displayColumns}
          rows={displayRows}
          chart={config.chart}
          groupBy={config.groupBy}
          firstAggLabel={config.aggregations[0] ? aggLabel(config.aggregations[0]) : undefined}
        />
      </div>
    </div>
  );
}
