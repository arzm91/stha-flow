import { useEditorStore } from '@/lib/reports/store'
import type { Block, DataSourceKey } from '@/lib/reports/types'
import { DATA_SOURCE_COLUMNS, DATA_SOURCE_LABELS, DYNAMIC_FIELDS } from '@/lib/reports/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/integrations/supabase/client'
import { useState } from 'react'
import { toast } from 'sonner'

export function PropertiesPanel({ effectiveOwnerId }: { effectiveOwnerId: string }) {
  const selectedId = useEditorStore((s) => s.selectedId)
  const canvas = useEditorStore((s) => s.canvas)
  const updateBlock = useEditorStore((s) => s.updateBlock)
  const updateBlockProps = useEditorStore((s) => s.updateBlockProps)

  const block: Block | undefined = canvas.pages[0]?.blocks.find((b) => b.id === selectedId)

  if (!block) {
    return <div className="p-4 text-sm text-muted-foreground">Selecione um bloco para editar suas propriedades.</div>
  }
  const p = (block as any).props

  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Propriedades — {block.type}</div>

      <div className="grid grid-cols-2 gap-2">
        <NumField label="X" value={block.x} onChange={(v) => updateBlock(block.id, { x: v })} />
        <NumField label="Y" value={block.y} onChange={(v) => updateBlock(block.id, { y: v })} />
        <NumField label="Larg." value={block.w} onChange={(v) => updateBlock(block.id, { w: v })} />
        <NumField label="Alt." value={block.h} onChange={(v) => updateBlock(block.id, { h: v })} />
      </div>

      {(block.type === 'text' || block.type === 'heading') && (
        <>
          <Field label="Texto">
            <Textarea rows={3} value={p.text} onChange={(e) => updateBlockProps(block.id, { text: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Fonte" value={p.fontSize} onChange={(v) => updateBlockProps(block.id, { fontSize: v })} />
            <ColorField label="Cor" value={p.color} onChange={(v) => updateBlockProps(block.id, { color: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Negrito</Label>
            <Switch checked={!!p.bold} onCheckedChange={(v) => updateBlockProps(block.id, { bold: v })} />
          </div>
          <Field label="Alinhamento">
            <Select value={p.align ?? 'left'} onValueChange={(v) => updateBlockProps(block.id, { align: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}

      {block.type === 'image' && (
        <>
          <Field label="URL da imagem">
            <Input value={p.url ?? ''} onChange={(e) => updateBlockProps(block.id, { url: e.target.value })} placeholder="https://…" />
          </Field>
          <ImageUploader ownerId={effectiveOwnerId} onUploaded={(url) => updateBlockProps(block.id, { url })} />
          <Field label="Ajuste">
            <Select value={p.fit ?? 'contain'} onValueChange={(v) => updateBlockProps(block.id, { fit: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">Conter</SelectItem>
                <SelectItem value="cover">Cobrir</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}

      {block.type === 'divider' && (
        <>
          <ColorField label="Cor" value={p.color} onChange={(v) => updateBlockProps(block.id, { color: v })} />
          <NumField label="Espessura" value={p.thickness} onChange={(v) => updateBlockProps(block.id, { thickness: v })} />
        </>
      )}

      {block.type === 'dynamic' && (
        <>
          <Field label="Campo">
            <Select value={p.field} onValueChange={(v) => updateBlockProps(block.id, { field: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DYNAMIC_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rótulo (opcional)">
            <Input value={p.label ?? ''} onChange={(e) => updateBlockProps(block.id, { label: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Fonte" value={p.fontSize} onChange={(v) => updateBlockProps(block.id, { fontSize: v })} />
            <ColorField label="Cor" value={p.color} onChange={(v) => updateBlockProps(block.id, { color: v })} />
          </div>
        </>
      )}

      {block.type === 'kpi' && (
        <>
          <Field label="Rótulo"><Input value={p.label} onChange={(e) => updateBlockProps(block.id, { label: e.target.value })} /></Field>
          <DataSourcePicker block={block} />
          <Field label="Agregação">
            <Select value={p.aggregate} onValueChange={(v) => updateBlockProps(block.id, { aggregate: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="count">Contagem</SelectItem>
                <SelectItem value="sum">Soma</SelectItem>
                <SelectItem value="avg">Média</SelectItem>
                <SelectItem value="min">Mínimo</SelectItem>
                <SelectItem value="max">Máximo</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {p.aggregate !== 'count' && (
            <Field label="Campo numérico"><Input value={p.field ?? ''} onChange={(e) => updateBlockProps(block.id, { field: e.target.value })} placeholder="ex: quantidade" /></Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Cor" value={p.color} onChange={(v) => updateBlockProps(block.id, { color: v })} />
            <Field label="Unidade"><Input value={p.unit ?? ''} onChange={(e) => updateBlockProps(block.id, { unit: e.target.value })} /></Field>
          </div>
        </>
      )}

      {block.type === 'table' && (
        <>
          <Field label="Título (opcional)"><Input value={p.title ?? ''} onChange={(e) => updateBlockProps(block.id, { title: e.target.value })} /></Field>
          <DataSourcePicker block={block} />
          <ColorField label="Cor do cabeçalho" value={p.headerColor} onChange={(v) => updateBlockProps(block.id, { headerColor: v })} />
          <div className="flex items-center justify-between">
            <Label className="text-xs">Zebra</Label>
            <Switch checked={!!p.stripe} onCheckedChange={(v) => updateBlockProps(block.id, { stripe: v })} />
          </div>
        </>
      )}

      {block.type === 'chart' && (
        <>
          <Field label="Título (opcional)"><Input value={p.title ?? ''} onChange={(e) => updateBlockProps(block.id, { title: e.target.value })} /></Field>
          <DataSourcePicker block={block} />
          <Field label="Tipo">
            <Select value={p.chartType} onValueChange={(v) => updateBlockProps(block.id, { chartType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Barras</SelectItem>
                <SelectItem value="line">Linha</SelectItem>
                <SelectItem value="pie">Pizza</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Eixo X"><Input value={p.xField} onChange={(e) => updateBlockProps(block.id, { xField: e.target.value })} /></Field>
            <Field label="Eixo Y"><Input value={p.yField} onChange={(e) => updateBlockProps(block.id, { yField: e.target.value })} /></Field>
          </div>
          <ColorField label="Cor" value={p.color} onChange={(v) => updateBlockProps(block.id, { color: v })} />
        </>
      )}

      {block.type === 'signature' && (
        <>
          <Field label="Rótulo"><Input value={p.label} onChange={(e) => updateBlockProps(block.id, { label: e.target.value })} /></Field>
          <ColorField label="Cor da linha" value={p.lineColor} onChange={(v) => updateBlockProps(block.id, { lineColor: v })} />
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </Field>
  )
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2 items-center">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  )
}

function DataSourcePicker({ block }: { block: Block }) {
  const updateBlockProps = useEditorStore((s) => s.updateBlockProps)
  const p = (block as any).props
  const ds = p.dataSource ?? { source: 'ordens_producao', columns: [], period: '30d', limit: 100 }
  const cols = DATA_SOURCE_COLUMNS[ds.source as DataSourceKey] ?? []
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="text-xs font-semibold text-muted-foreground">Fonte de dados</div>
      <Field label="Origem">
        <Select value={ds.source} onValueChange={(v) => updateBlockProps(block.id, { dataSource: { ...ds, source: v, columns: DATA_SOURCE_COLUMNS[v as DataSourceKey] ?? [] } })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(DATA_SOURCE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Colunas (separadas por vírgula)">
        <Input value={ds.columns.join(',')} onChange={(e) => updateBlockProps(block.id, { dataSource: { ...ds, columns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} />
        <div className="text-[10px] text-muted-foreground mt-1">Sugeridas: {cols.join(', ')}</div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Período">
          <Select value={ds.period ?? 'all'} onValueChange={(v) => updateBlockProps(block.id, { dataSource: { ...ds, period: v } })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="month">Mês atual</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <NumField label="Limite" value={ds.limit ?? 100} onChange={(v) => updateBlockProps(block.id, { dataSource: { ...ds, limit: v } })} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Aplicar escopo do relatório</Label>
        <Switch checked={ds.useScope !== false} onCheckedChange={(v) => updateBlockProps(block.id, { dataSource: { ...ds, useScope: v } })} />
      </div>
    </div>
  )
}

function ImageUploader({ ownerId, onUploaded }: { ownerId: string; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <Input type="file" accept="image/*" disabled={busy} onChange={async (e) => {
        const file = e.target.files?.[0]; if (!file) return
        setBusy(true)
        try {
          const path = `${ownerId}/${crypto.randomUUID()}-${file.name}`
          const { error } = await supabase.storage.from('report-assets').upload(path, file)
          if (error) throw error
          const { data } = await supabase.storage.from('report-assets').createSignedUrl(path, 60 * 60 * 24 * 365)
          if (data?.signedUrl) { onUploaded(data.signedUrl); toast.success('Imagem enviada') }
        } catch (err: any) { toast.error(err.message ?? 'Falha ao enviar') } finally { setBusy(false) }
      }} />
    </div>
  )
}
