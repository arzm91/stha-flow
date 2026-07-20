export type ColumnType = "text" | "number" | "date" | "boolean";

export type ColumnSource =
  | "none"
  | "op_numero"
  | "produto_nome"
  | "quantidade"
  | "duracao_min"
  | "inicio_em"
  | "fim_em"
  | "tag";

export type SheetColumn = {
  key: string;
  label: string;
  type: ColumnType;
  /** Fórmula opcional (ex.: "temp_saida - temp_reator" ou "tag_x / 1000"). */
  formula?: string;
  /** Nome da tag ao vivo associada (quando source="tag" ou como variável na fórmula). */
  tagNome?: string;
  /** Fonte automática quando a linha é criada ao finalizar uma produção. */
  source?: ColumnSource;
};

export const COLUMN_SOURCE_LABELS: Record<ColumnSource, string> = {
  none: "— (manual)",
  op_numero: "Número da OP",
  produto_nome: "Produto",
  quantidade: "Quantidade produzida",
  duracao_min: "Duração (min)",
  inicio_em: "Início",
  fim_em: "Fim",
  tag: "Tag ao vivo (usar campo tag)",
};
