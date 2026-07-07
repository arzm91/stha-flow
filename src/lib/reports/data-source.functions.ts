import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import type { DataSourceKey } from './types'

interface Input {
  source: DataSourceKey
  columns: string[]
  period?: '7d' | '30d' | 'month' | 'all'
  limit?: number
}

const TABLE_MAP: Record<DataSourceKey, string> = {
  ordens_producao: 'ordens_producao',
  equipamentos: 'equipamentos',
  ordens_manutencao: 'ordens_manutencao',
  manutencao_preventivas: 'manutencao_preventivas',
  produtos: 'produtos',
  analises_registradas: 'analises_registradas',
  tags_live: 'tags_live',
}

const DATE_COL: Partial<Record<DataSourceKey, string>> = {
  ordens_producao: 'created_at',
  ordens_manutencao: 'created_at',
  analises_registradas: 'created_at',
  tags_live: 'atualizado_em',
}

function periodStart(period: string | undefined): string | null {
  if (!period || period === 'all') return null
  const now = new Date()
  if (period === '7d') now.setDate(now.getDate() - 7)
  else if (period === '30d') now.setDate(now.getDate() - 30)
  else if (period === 'month') now.setDate(1)
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

export const fetchReportData = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => data)
  .handler(async ({ data, context }) => {
    const table = TABLE_MAP[data.source]
    if (!table) throw new Error('Fonte inválida')
    const cols = data.columns.length ? data.columns.join(',') : '*'
    let q = (context.supabase as any).from(table).select(cols).limit(data.limit ?? 100)
    const dateCol = DATE_COL[data.source]
    const start = periodStart(data.period)
    if (dateCol && start) q = q.gte(dateCol, start)
    if (dateCol) q = q.order(dateCol, { ascending: false })
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)
    return { rows: (rows ?? []) as Record<string, unknown>[] }
  })
