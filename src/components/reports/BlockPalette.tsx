import { Button } from '@/components/ui/button'
import { Type, Heading, Image as ImageIcon, Minus, MoveVertical, Hash, Gauge, Table, BarChart3, PenLine } from 'lucide-react'
import type { BlockType, Block } from '@/lib/reports/types'
import { useEditorStore } from '@/lib/reports/store'

const uid = () => crypto.randomUUID()

const CATALOG: Array<{ type: BlockType; label: string; icon: any; make: () => Block }> = [
  { type: 'heading', label: 'Título', icon: Heading, make: () => ({ id: uid(), type: 'heading', x: 40, y: 40, w: 400, h: 44, props: { text: 'Novo Título', fontSize: 22, color: '#0f172a', bold: true, align: 'left' } }) },
  { type: 'text', label: 'Texto', icon: Type, make: () => ({ id: uid(), type: 'text', x: 40, y: 40, w: 400, h: 60, props: { text: 'Digite seu texto aqui…', fontSize: 12, color: '#334155', align: 'left' } }) },
  { type: 'image', label: 'Imagem / Logo', icon: ImageIcon, make: () => ({ id: uid(), type: 'image', x: 40, y: 40, w: 160, h: 90, props: { url: '', fit: 'contain' } }) },
  { type: 'divider', label: 'Divisória', icon: Minus, make: () => ({ id: uid(), type: 'divider', x: 40, y: 40, w: 400, h: 10, props: { color: '#0f172a', thickness: 2 } }) },
  { type: 'spacer', label: 'Espaçador', icon: MoveVertical, make: () => ({ id: uid(), type: 'spacer', x: 40, y: 40, w: 200, h: 40, props: {} }) },
  { type: 'dynamic', label: 'Campo dinâmico', icon: Hash, make: () => ({ id: uid(), type: 'dynamic', x: 40, y: 40, w: 260, h: 30, props: { field: 'data_hoje', label: 'Data', fontSize: 12, color: '#0f172a' } }) },
  { type: 'kpi', label: 'KPI / Indicador', icon: Gauge, make: () => ({ id: uid(), type: 'kpi', x: 40, y: 40, w: 200, h: 100, props: { label: 'Indicador', dataSource: { source: 'ordens_producao', columns: ['id'], period: '30d', limit: 500 }, aggregate: 'count', color: '#2563eb' } }) },
  { type: 'table', label: 'Tabela de dados', icon: Table, make: () => ({ id: uid(), type: 'table', x: 40, y: 40, w: 600, h: 240, props: { dataSource: { source: 'ordens_producao', columns: ['numero','produto_nome','quantidade','status'], period: '30d', limit: 20 }, headerColor: '#2563eb', stripe: true } }) },
  { type: 'chart', label: 'Gráfico', icon: BarChart3, make: () => ({ id: uid(), type: 'chart', x: 40, y: 40, w: 400, h: 240, props: { dataSource: { source: 'ordens_producao', columns: ['numero','quantidade'], period: '30d', limit: 20 }, chartType: 'bar', xField: 'numero', yField: 'quantidade', color: '#2563eb' } }) },
  { type: 'signature', label: 'Assinatura', icon: PenLine, make: () => ({ id: uid(), type: 'signature', x: 40, y: 40, w: 260, h: 60, props: { label: 'Responsável', lineColor: '#0f172a' } }) },
]

export function BlockPalette() {
  const addBlock = useEditorStore((s) => s.addBlock)
  return (
    <div className="p-3 space-y-1">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Blocos</div>
      {CATALOG.map((c) => (
        <Button key={c.type + c.label} variant="ghost" size="sm" className="w-full justify-start gap-2 h-9"
          onClick={() => addBlock(0, c.make())}>
          <c.icon className="w-4 h-4" />
          <span className="text-sm">{c.label}</span>
        </Button>
      ))}
    </div>
  )
}
