import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { fetchReportData } from '@/lib/reports/data-source.functions'
import type { Block, DYNAMIC_FIELDS } from '@/lib/reports/types'
import { useReportScope } from '@/lib/reports/scope-context'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Props {
  block: Block
  dynamicValues: Record<string, string>
}

const CHART_COLORS = ['#2563eb','#0f766e','#7c3aed','#ea580c','#db2777','#0891b2','#65a30d','#dc2626']

function interpolate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? `{{${k}}}`)
}

function useSourceRows(block: Block) {
  const anyBlock = block as any
  const cfg = anyBlock.props?.dataSource
  const scope = useReportScope()
  const call = useServerFn(fetchReportData)
  const effectiveCfg = cfg
    ? { ...cfg, scope: cfg.useScope === false ? undefined : { equipamentoIds: scope.equipamentoIds, produtoIds: scope.produtoIds, tanqueIds: scope.tanqueIds, analiseIds: scope.analiseIds } }
    : cfg
  return useQuery({
    queryKey: ['report-data', effectiveCfg],
    queryFn: () => call({ data: effectiveCfg }),
    enabled: !!cfg?.source,
    staleTime: 60_000,
  })
}


export function BlockView({ block, dynamicValues }: Props) {
  if (block.type === 'text' || block.type === 'heading') {
    const p = (block as any).props
    return (
      <div style={{
        fontSize: p.fontSize, color: p.color, fontWeight: p.bold ? 700 : 400,
        fontStyle: p.italic ? 'italic' : 'normal', textAlign: p.align ?? 'left',
        whiteSpace: 'pre-wrap', width: '100%', height: '100%', overflow: 'hidden',
      }}>{interpolate(p.text ?? '', dynamicValues)}</div>
    )
  }
  if (block.type === 'image') {
    const p = (block as any).props
    if (!p.url) return <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs border border-dashed">Sem imagem</div>
    return <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: p.fit ?? 'contain' }} />
  }
  if (block.type === 'divider') {
    const p = (block as any).props
    return <div style={{ width: '100%', borderTop: `${p.thickness}px solid ${p.color}`, marginTop: 'calc(50% - 1px)' }} />
  }
  if (block.type === 'spacer') return <div className="w-full h-full" />
  if (block.type === 'dynamic') {
    const p = (block as any).props
    const val = dynamicValues[p.field] ?? `{{${p.field}}}`
    return (
      <div style={{ fontSize: p.fontSize, color: p.color, fontWeight: p.bold ? 700 : 400, width: '100%', height: '100%' }}>
        {p.label ? <><span className="opacity-70">{p.label}:</span>{' '}</> : null}{val}
      </div>
    )
  }
  if (block.type === 'signature') {
    const p = (block as any).props
    return (
      <div className="w-full h-full flex flex-col justify-end">
        <div style={{ borderTop: `1px solid ${p.lineColor}`, width: '100%' }} />
        <div className="text-xs text-center mt-1 text-muted-foreground">{p.label}</div>
      </div>
    )
  }
  if (block.type === 'kpi') return <KpiBlockView block={block} />
  if (block.type === 'table') return <TableBlockView block={block} />
  if (block.type === 'chart') return <ChartBlockView block={block} />
  return null
}

function KpiBlockView({ block }: { block: Block }) {
  const p = (block as any).props
  const { data, isLoading } = useSourceRows(block)
  let value: number | string = '—'
  if (data?.rows) {
    if (p.aggregate === 'count') value = data.rows.length
    else if (p.field) {
      const nums = data.rows.map((r: any) => Number(r[p.field])).filter((n: number) => !Number.isNaN(n))
      if (nums.length) {
        if (p.aggregate === 'sum') value = nums.reduce((a: number, b: number) => a + b, 0)
        if (p.aggregate === 'avg') value = nums.reduce((a: number, b: number) => a + b, 0) / nums.length
        if (p.aggregate === 'min') value = Math.min(...nums)
        if (p.aggregate === 'max') value = Math.max(...nums)
        if (typeof value === 'number') value = Number(value.toFixed(2))
      }
    }
  }
  return (
    <div className="w-full h-full flex flex-col justify-center px-4 py-3 rounded-lg" style={{ border: `1px solid ${p.color}22`, background: `${p.color}0a` }}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{p.label}</div>
      <div className="text-3xl font-bold mt-1" style={{ color: p.color }}>
        {isLoading ? '…' : value}{p.unit ? <span className="text-base ml-1 font-normal">{p.unit}</span> : null}
      </div>
    </div>
  )
}

function TableBlockView({ block }: { block: Block }) {
  const p = (block as any).props
  const { data, isLoading } = useSourceRows(block)
  const cols: string[] = p.dataSource?.columns ?? []
  const rows = data?.rows ?? []
  return (
    <div className="w-full h-full overflow-auto">
      {p.title ? <div className="font-semibold mb-2">{p.title}</div> : null}
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className="text-left px-2 py-1.5 font-semibold text-white capitalize" style={{ background: p.headerColor }}>
                {c.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading && <tr><td colSpan={cols.length} className="p-2 text-center text-muted-foreground">Carregando…</td></tr>}
          {!isLoading && rows.length === 0 && <tr><td colSpan={cols.length} className="p-2 text-center text-muted-foreground">Sem dados</td></tr>}
          {rows.map((r: any, i: number) => (
            <tr key={i} style={{ background: p.stripe && i % 2 ? '#f8fafc' : 'transparent' }}>
              {cols.map((c) => (
                <td key={c} className="px-2 py-1 border-b border-slate-200 align-top">{formatCell(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartBlockView({ block }: { block: Block }) {
  const p = (block as any).props
  const { data, isLoading } = useSourceRows(block)
  const rows = data?.rows ?? []
  const chartData = rows.map((r: any) => ({ x: String(r[p.xField] ?? ''), y: Number(r[p.yField]) || 0 }))
  return (
    <div className="w-full h-full flex flex-col">
      {p.title ? <div className="font-semibold mb-1 text-sm">{p.title}</div> : null}
      <div className="flex-1 min-h-0">
        {isLoading ? <div className="text-muted-foreground text-xs">Carregando…</div> : (
          <ResponsiveContainer width="100%" height="100%">
            {p.chartType === 'line' ? (
              <LineChart data={chartData}>
                <XAxis dataKey="x" fontSize={10} /><YAxis fontSize={10} /><Tooltip />
                <Line type="monotone" dataKey="y" stroke={p.color} />
              </LineChart>
            ) : p.chartType === 'pie' ? (
              <PieChart>
                <Pie data={chartData} dataKey="y" nameKey="x" outerRadius="80%" label>
                  {chartData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            ) : (
              <BarChart data={chartData}>
                <XAxis dataKey="x" fontSize={10} /><YAxis fontSize={10} /><Tooltip />
                <Bar dataKey="y" fill={p.color} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    try { return new Date(v).toLocaleString('pt-BR') } catch { return v }
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export type { DYNAMIC_FIELDS }
