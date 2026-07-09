import { Rnd } from 'react-rnd'
import { X } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { SheetObject, ChartObject } from '@/lib/reports/spreadsheet-types'

type Props = {
  objects: SheetObject[]
  onChange: (id: string, patch: Partial<SheetObject>) => void
  onRemove: (id: string) => void
}

const PIE_COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899']

function ChartRender({ obj }: { obj: ChartObject }) {
  const data = obj.series.map((s, i) => ({
    label: s.label || `Série ${i + 1}`,
    value: obj.values?.[i] ?? 0,
  }))
  const empty = data.every((d) => !d.value)
  return (
    <div className="w-full h-full flex flex-col bg-background border rounded p-2">
      {obj.title && <div className="text-xs font-semibold text-center mb-1 truncate">{obj.title}</div>}
      <div className="flex-1 min-h-0">
        {empty ? (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
            Aguardando dados… (clique em Recalcular)
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {obj.chartType === 'bar' ? (
              <BarChart data={data}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#f97316" />
              </BarChart>
            ) : obj.chartType === 'line' ? (
              <LineChart data={data}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            ) : (
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" outerRadius="80%" label={{ fontSize: 10 }}>
                  {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function ShapeRender({ obj }: { obj: Extract<SheetObject, { kind: 'shape' }> }) {
  const fill = obj.fill ?? 'transparent'
  const stroke = obj.stroke ?? '#111827'
  const sw = obj.strokeWidth ?? 2
  if (obj.shape === 'rectangle') {
    return <div style={{ width: '100%', height: '100%', background: fill, border: `${sw}px solid ${stroke}`, borderRadius: obj.rounded ?? 0 }} />
  }
  if (obj.shape === 'ellipse') {
    return <div style={{ width: '100%', height: '100%', background: fill, border: `${sw}px solid ${stroke}`, borderRadius: '50%' }} />
  }
  // line
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${obj.w} ${obj.h}`} preserveAspectRatio="none">
      <line x1="0" y1={obj.h / 2} x2={obj.w} y2={obj.h / 2} stroke={stroke} strokeWidth={sw} />
    </svg>
  )
}

export function SpreadsheetObjectsLayer({ objects, onChange, onRemove }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {objects.map((obj) => (
        <Rnd
          key={obj.id}
          className="pointer-events-auto group"
          size={{ width: obj.w, height: obj.h }}
          position={{ x: obj.x, y: obj.y }}
          bounds="parent"
          onDragStop={(_, d) => onChange(obj.id, { x: d.x, y: d.y } as any)}
          onResizeStop={(_e, _dir, refEl, _delta, pos) =>
            onChange(obj.id, { w: refEl.offsetWidth, h: refEl.offsetHeight, x: pos.x, y: pos.y } as any)
          }
          style={{ zIndex: obj.z ?? 1 }}
        >
          <div className="relative w-full h-full">
            {obj.kind === 'image' && (
              <img src={obj.src} alt={obj.alt ?? ''} className="w-full h-full object-contain select-none pointer-events-none" draggable={false} />
            )}
            {obj.kind === 'shape' && <ShapeRender obj={obj} />}
            {obj.kind === 'chart' && <ChartRender obj={obj} />}
            <button
              type="button"
              onClick={() => onRemove(obj.id)}
              title="Remover"
              className="opacity-0 group-hover:opacity-100 transition absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center shadow"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </Rnd>
      ))}
    </div>
  )
}
