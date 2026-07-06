export type Fonte = "producao" | "estoque_qualidade" | "manutencao_automacao";

export type SourceKey =
  | "producao.etapas"
  | "producao.ordens"
  | "producao.analises"
  | "estoque.movimentacoes"
  | "estoque.tanques_analises"
  | "manutencao.ordens"
  | "manutencao.preventivas"
  | "automacao.alertas"
  | "automacao.runs";

export type ColumnType = "text" | "number" | "date" | "datetime" | "duration_seg";

export type ColumnDef = {
  key: string;
  label: string;
  type: ColumnType;
  numeric?: boolean;
};

export type FilterKind =
  | "date_range"
  | "select_equipamento"
  | "select_produto"
  | "select_status"
  | "select_tipo"
  | "select_prioridade";

export type FilterDef = {
  key: FilterKind;
  label: string;
  appliesTo?: string; // column key on the fetched row (for select filters)
};

export type SourceDef = {
  key: SourceKey;
  fonte: Fonte;
  label: string;
  description: string;
  dateColumn: string;
  columns: ColumnDef[];
  filters: FilterDef[];
};

export type AggregationOp = "sum" | "avg" | "count" | "min" | "max";

export type Aggregation = {
  column: string;
  op: AggregationOp;
  label?: string;
};

export type ChartConfig = {
  enabled: boolean;
  type: "bar" | "line" | "pie";
  x?: string;           // group-by column key
  y?: string;           // aggregation label key
};

export type FiltersValue = {
  data_de?: string | null;
  data_ate?: string | null;
  equipamento_id?: string | null;
  produto_id?: string | null;
  status?: string | null;
  tipo?: string | null;
  prioridade?: string | null;
};

export type ReportConfig = {
  source: SourceKey;
  columns: string[];         // ordered list of column keys to display
  labels?: Record<string, string>; // optional overrides
  filters: FiltersValue;
  groupBy: string[];         // 0..2
  aggregations: Aggregation[];
  chart: ChartConfig;
};

export type Row = Record<string, unknown>;
