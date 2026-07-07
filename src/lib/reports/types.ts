export type BlockType =
  | 'text'
  | 'heading'
  | 'image'
  | 'divider'
  | 'spacer'
  | 'dynamic'
  | 'kpi'
  | 'table'
  | 'chart'
  | 'signature'

export type DataSourceKey =
  | 'ordens_producao'
  | 'equipamentos'
  | 'ordens_manutencao'
  | 'manutencao_preventivas'
  | 'produtos'
  | 'analises_registradas'
  | 'tags_live'

export interface DataSourceConfig {
  source: DataSourceKey
  columns: string[]
  period?: '7d' | '30d' | 'month' | 'all'
  limit?: number
  filters?: Record<string, string | number | null>
}

export interface BlockBase {
  id: string
  type: BlockType
  x: number
  y: number
  w: number
  h: number
  z?: number
}

export interface TextBlock extends BlockBase {
  type: 'text' | 'heading'
  props: {
    text: string
    fontSize: number
    color: string
    bold?: boolean
    italic?: boolean
    align?: 'left' | 'center' | 'right'
  }
}

export interface ImageBlock extends BlockBase {
  type: 'image'
  props: {
    url: string
    fit?: 'contain' | 'cover'
  }
}

export interface DividerBlock extends BlockBase {
  type: 'divider'
  props: { color: string; thickness: number }
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer'
  props: Record<string, never>
}

export interface DynamicBlock extends BlockBase {
  type: 'dynamic'
  props: { field: string; label?: string; fontSize: number; color: string; bold?: boolean }
}

export interface KpiBlock extends BlockBase {
  type: 'kpi'
  props: {
    label: string
    dataSource: DataSourceConfig
    aggregate: 'count' | 'sum' | 'avg' | 'min' | 'max'
    field?: string
    color: string
    unit?: string
  }
}

export interface TableBlock extends BlockBase {
  type: 'table'
  props: {
    title?: string
    dataSource: DataSourceConfig
    headerColor: string
    stripe?: boolean
  }
}

export interface ChartBlock extends BlockBase {
  type: 'chart'
  props: {
    title?: string
    dataSource: DataSourceConfig
    chartType: 'bar' | 'line' | 'pie'
    xField: string
    yField: string
    color: string
  }
}

export interface SignatureBlock extends BlockBase {
  type: 'signature'
  props: { label: string; lineColor: string }
}

export type Block =
  | TextBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | DynamicBlock
  | KpiBlock
  | TableBlock
  | ChartBlock
  | SignatureBlock

export interface Page {
  id: string
  blocks: Block[]
}

export interface Canvas {
  pages: Page[]
}

export interface Theme {
  primary: string
  font: string
}

export const PAGE_SIZES = {
  A4: { portrait: { w: 794, h: 1123 }, landscape: { w: 1123, h: 794 } },
  Letter: { portrait: { w: 816, h: 1056 }, landscape: { w: 1056, h: 816 } },
} as const

export type PageSizeKey = keyof typeof PAGE_SIZES

export const DATA_SOURCE_LABELS: Record<DataSourceKey, string> = {
  ordens_producao: 'Ordens de Produção',
  equipamentos: 'Equipamentos',
  ordens_manutencao: 'Ordens de Manutenção',
  manutencao_preventivas: 'Manutenções Preventivas',
  produtos: 'Produtos',
  analises_registradas: 'Análises Registradas',
  tags_live: 'Tags ao Vivo',
}

export const DATA_SOURCE_COLUMNS: Record<DataSourceKey, string[]> = {
  ordens_producao: ['numero', 'status', 'prioridade', 'qtd_planejada', 'qtd_produzida', 'inicio_em', 'fim_em', 'created_at'],
  equipamentos: ['codigo', 'nome', 'tipo', 'status', 'localizacao', 'categoria'],
  ordens_manutencao: ['numero', 'tipo', 'status', 'prioridade', 'responsavel', 'data_abertura', 'data_inicio', 'data_conclusao', 'custo'],
  manutencao_preventivas: ['nome', 'descricao', 'tipo_recorrencia', 'intervalo_dias', 'proxima_execucao', 'ultima_execucao', 'ativo'],
  produtos: ['codigo', 'nome', 'unidade', 'categoria', 'ativo'],
  analises_registradas: ['resultado', 'registrado_em', 'created_at'],
  tags_live: ['nome', 'nome_amigavel', 'valor', 'valor_num', 'unidade', 'grupo', 'qualidade', 'atualizado_em'],
}

export const DYNAMIC_FIELDS = [
  { key: 'data_hoje', label: 'Data de hoje' },
  { key: 'hora_agora', label: 'Hora atual' },
  { key: 'usuario_nome', label: 'Nome do usuário' },
  { key: 'empresa_nome', label: 'Nome da empresa' },
  { key: 'relatorio_nome', label: 'Nome do relatório' },
] as const
