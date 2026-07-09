import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus } from 'lucide-react'
import { listResolverOptions } from '@/lib/reports/formulas.functions'
import type { ChartObject, ChartSeries } from '@/lib/reports/spreadsheet-types'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  onInsert: (chart: ChartObject) => void
}

type SourceKind = 'ultima_producao' | 'soma_producao' | 'tag_atual' | 'estoque_saldo' | 'os_abertas'

const SOURCES: { value: SourceKind; label: string; description: string; unit: 'equipamento' | 'produto' | 'tag' }[] = [
  { value: 'ultima_producao', label: 'Última produção do equipamento', description: 'Qtd. produzida da última OP', unit: 'equipamento' },
  { value: 'soma_producao', label: 'Soma de produção (últimos 30 dias)', description: 'qtd_produzida somada', unit: 'equipamento' },
  { value: 'tag_atual', label: 'Valor atual da tag', description: 'Último valor da tag', unit: 'tag' },
  { value: 'estoque_saldo', label: 'Saldo em estoque do produto', description: 'Saldo atual', unit: 'produto' },
  { value: 'os_abertas', label: 'OS de manutenção abertas', description: 'Contagem por equipamento', unit: 'equipamento' },
]

function buildFormula(source: SourceKind, target: string): string {
  const t = target.replace(/"/g, '')
  const today = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  switch (source) {
    case 'ultima_producao': return `=STHA_PROD_ULTIMA("${t}";"qtd_produzida")`
    case 'soma_producao':   return `=STHA_PROD_SOMA("${t}";"${from}";"${today}")`
    case 'tag_atual':       return `=STHA_TAG_ATUAL("${t}")`
    case 'estoque_saldo':   return `=STHA_ESTOQUE_SALDO("${t}")`
    case 'os_abertas':      return `=STHA_MANUT_ABERTAS("${t}")`
  }
}

export function InsertChartDialog({ open, onOpenChange, onInsert }: Props) {
  const listOpts = useServerFn(listResolverOptions)
  const { data: opts } = useQuery({
    queryKey: ['reports', 'resolver-options'],
    queryFn: () => listOpts(),
    enabled: open,
  })

  const [title, setTitle] = useState('Novo gráfico')
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar')
  const [source, setSource] = useState<SourceKind>('ultima_producao')
  const [series, setSeries] = useState<ChartSeries[]>([])
  const [pick, setPick] = useState('')

  const src = SOURCES.find((s) => s.value === source)!

  const targetOptions: { value: string; label: string }[] = (() => {
    if (!opts) return []
    if (src.unit === 'equipamento') return (opts.equipamentos ?? []).map((e: any) => ({ value: e.codigo || e.nome, label: `${e.nome}${e.codigo ? ` (${e.codigo})` : ''}` }))
    if (src.unit === 'produto') return (opts.produtos ?? []).map((p: any) => ({ value: p.codigo || p.nome, label: `${p.nome}${p.codigo ? ` (${p.codigo})` : ''}` }))
    if (src.unit === 'tag') return (opts.tags ?? []).map((t: any) => ({ value: t.nome, label: t.nome_amigavel || t.nome }))
    return []
  })()

  const addSeries = () => {
    if (!pick) return
    const label = targetOptions.find((o) => o.value === pick)?.label ?? pick
    setSeries((prev) => [...prev, { label, formula: buildFormula(source, pick) }])
    setPick('')
  }

  const submit = () => {
    if (!series.length) return
    const chart: ChartObject = {
      id: `chart_${Date.now()}`,
      kind: 'chart',
      x: 40, y: 40, w: 420, h: 260,
      chartType, title, series,
    }
    onInsert(chart)
    setSeries([]); setTitle('Novo gráfico'); setPick('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Inserir gráfico</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Tipo de gráfico</Label>
              <Select value={chartType} onValueChange={(v: any) => setChartType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Barras</SelectItem>
                  <SelectItem value="line">Linhas</SelectItem>
                  <SelectItem value="pie">Pizza</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fonte dos dados</Label>
              <Select value={source} onValueChange={(v: any) => { setSource(v); setPick('') }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{src.description}</p>
            </div>
            <div>
              <Label>Adicionar série ({src.unit})</Label>
              <div className="flex gap-2">
                <Select value={pick} onValueChange={setPick}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {targetOptions.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={addSeries} disabled={!pick}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>

          <div>
            <Label>Séries ({series.length})</Label>
            <div className="border rounded divide-y max-h-52 overflow-auto">
              {series.length === 0 && <div className="p-3 text-xs text-muted-foreground">Adicione ao menos uma série.</div>}
              {series.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <Input className="h-7 flex-1" value={s.label} onChange={(e) => {
                    const cp = [...series]; cp[i] = { ...cp[i], label: e.target.value }; setSeries(cp)
                  }} />
                  <code className="text-[10px] text-muted-foreground truncate max-w-[45%]">{s.formula}</code>
                  <Button size="sm" variant="ghost" onClick={() => setSeries(series.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!series.length}>Inserir gráfico</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
