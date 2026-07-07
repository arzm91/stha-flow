import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import type { DataSourceKey } from './types'

interface Input {
  source: DataSourceKey
  columns: string[]
  period?: '24h' | '7d' | '30d' | 'month' | 'all'
  limit?: number
  useScope?: boolean
  scope?: {
    equipamentoIds?: string[]
    produtoIds?: string[]
    tanqueIds?: string[]
    analiseIds?: string[]
  }
}

const TABLE_MAP: Record<DataSourceKey, string> = {
  ordens_producao: 'ordens_producao',
  equipamentos: 'equipamentos',
  ordens_manutencao: 'ordens_manutencao',
  manutencao_preventivas: 'manutencao_preventivas',
  produtos: 'produtos',
  analises_registradas: 'analises_registradas',
  tags_live: 'tags_live',
  movimentacoes_estoque: 'movimentacoes_estoque',
  tanque_analises: 'tanque_analises',
  tanques: 'tanques',
}

const DATE_COL: Partial<Record<DataSourceKey, string>> = {
  ordens_producao: 'created_at',
  ordens_manutencao: 'data_abertura',
  analises_registradas: 'registrado_em',
  tags_live: 'atualizado_em',
  movimentacoes_estoque: 'ocorrido_em',
  tanque_analises: 'registrado_em',
}

function periodStart(period: string | undefined): string | null {
  if (!period || period === 'all') return null
  const now = new Date()
  if (period === '24h') now.setHours(now.getHours() - 24)
  else if (period === '7d') now.setDate(now.getDate() - 7)
  else if (period === '30d') now.setDate(now.getDate() - 30)
  else if (period === 'month') { now.setDate(1); now.setHours(0, 0, 0, 0) }
  return now.toISOString()
}

function applyScope(q: any, source: DataSourceKey, scope?: Input['scope']) {
  if (!scope) return q
  const eq = scope.equipamentoIds ?? []
  const pr = scope.produtoIds ?? []
  const tq = scope.tanqueIds ?? []
  const an = scope.analiseIds ?? []
  switch (source) {
    case 'ordens_producao':
      if (eq.length) q = q.in('equipamento_id', eq)
      if (pr.length) q = q.in('produto_id', pr)
      break
    case 'equipamentos':
      if (eq.length) q = q.in('id', eq)
      break
    case 'ordens_manutencao':
    case 'manutencao_preventivas':
      if (eq.length) q = q.in('equipamento_id', eq)
      break
    case 'produtos':
      if (pr.length) q = q.in('id', pr)
      break
    case 'analises_registradas':
      if (an.length) q = q.in('analise_id', an)
      break
    case 'movimentacoes_estoque':
      if (tq.length) q = q.in('tanque_id', tq)
      if (pr.length) q = q.in('produto_id', pr)
      break
    case 'tanque_analises':
      if (tq.length) q = q.in('tanque_id', tq)
      if (an.length) q = q.in('analise_id', an)
      break
    case 'tanques':
      if (tq.length) q = q.in('id', tq)
      break
    case 'tags_live':
      // no direct scope link
      break
  }
  return q
}

export const fetchReportData = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => data)
  .handler(async ({ data, context }) => {
    const table = TABLE_MAP[data.source]
    if (!table) throw new Error('Fonte inválida')
    const cols = data.columns.length ? data.columns.join(',') : '*'
    let q = (context.supabase as any).from(table).select(cols).limit(data.limit ?? 100)
    if (data.useScope !== false) q = applyScope(q, data.source, data.scope)
    const dateCol = DATE_COL[data.source]
    const start = periodStart(data.period)
    if (dateCol && start) q = q.gte(dateCol, start)
    if (dateCol) q = q.order(dateCol, { ascending: false })
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)
    return { rows: (rows ?? []) as Array<Record<string, any>> }
  })
