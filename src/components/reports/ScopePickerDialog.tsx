import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import type { ReportScope } from '@/lib/reports/scope-context'
import { EMPTY_SCOPE } from '@/lib/reports/scope-context'
import { Search } from 'lucide-react'

interface Item { id: string; label: string; sub?: string }

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: ReportScope
  showPrebuilt?: boolean
  onConfirm: (scope: ReportScope, prebuilt: string[]) => void
  confirmLabel?: string
}

export function ScopePickerDialog({ open, onOpenChange, initial, showPrebuilt = false, onConfirm, confirmLabel = 'Confirmar' }: Props) {
  const [scope, setScope] = useState<ReportScope>(initial ?? EMPTY_SCOPE)
  const [equipamentos, setEquipamentos] = useState<Item[]>([])
  const [produtos, setProdutos] = useState<Item[]>([])
  const [tanques, setTanques] = useState<Item[]>([])
  const [analises, setAnalises] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const [prebuilt, setPrebuilt] = useState<string[]>([])

  useEffect(() => { if (open) setScope(initial ?? EMPTY_SCOPE) }, [open, initial])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const [eq, pr, tq, an] = await Promise.all([
        supabase.from('equipamentos').select('id, codigo, nome, tipo').eq('ativo', true).order('nome'),
        supabase.from('produtos').select('id, codigo, nome, unidade').eq('ativo', true).order('nome'),
        supabase.from('tanques').select('id, codigo, nome, tipo').order('nome'),
        supabase.from('analises_cadastro').select('id, nome, unidade').order('nome'),
      ])
      setEquipamentos((eq.data ?? []).map((r: any) => ({ id: r.id, label: r.nome, sub: `${r.codigo}${r.tipo ? ' • ' + r.tipo : ''}` })))
      setProdutos((pr.data ?? []).map((r: any) => ({ id: r.id, label: r.nome, sub: `${r.codigo}${r.unidade ? ' • ' + r.unidade : ''}` })))
      setTanques((tq.data ?? []).map((r: any) => ({ id: r.id, label: r.nome, sub: `${r.codigo}${r.tipo ? ' • ' + r.tipo : ''}` })))
      setAnalises((an.data ?? []).map((r: any) => ({ id: r.id, label: r.nome, sub: r.unidade ?? '' })))
    })()
  }, [open])

  const filter = (list: Item[]) => q ? list.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()) || (i.sub ?? '').toLowerCase().includes(q.toLowerCase())) : list

  const toggle = (key: keyof ReportScope, id: string) => {
    setScope((s) => {
      const arr = s[key]
      return { ...s, [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] }
    })
  }
  const togglePb = (k: string) => setPrebuilt((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k])

  const totalSel = scope.equipamentoIds.length + scope.produtoIds.length + scope.tanqueIds.length + scope.analiseIds.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Escopo do relatório</DialogTitle>
          <p className="text-xs text-muted-foreground">Escolha os equipamentos, produtos, tanques ou análises que este relatório deve considerar. Os blocos com "Aplicar escopo" ativo irão filtrar automaticamente pelos itens selecionados.</p>
        </DialogHeader>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-8" />
        </div>

        <Tabs defaultValue="equipamentos" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="equipamentos">Equipamentos <Badge variant="secondary" className="ml-1">{scope.equipamentoIds.length}</Badge></TabsTrigger>
            <TabsTrigger value="produtos">Produtos <Badge variant="secondary" className="ml-1">{scope.produtoIds.length}</Badge></TabsTrigger>
            <TabsTrigger value="tanques">Tanques <Badge variant="secondary" className="ml-1">{scope.tanqueIds.length}</Badge></TabsTrigger>
            <TabsTrigger value="analises">Análises <Badge variant="secondary" className="ml-1">{scope.analiseIds.length}</Badge></TabsTrigger>
          </TabsList>
          <TabsContent value="equipamentos"><ItemList items={filter(equipamentos)} selected={scope.equipamentoIds} onToggle={(id) => toggle('equipamentoIds', id)} /></TabsContent>
          <TabsContent value="produtos"><ItemList items={filter(produtos)} selected={scope.produtoIds} onToggle={(id) => toggle('produtoIds', id)} /></TabsContent>
          <TabsContent value="tanques"><ItemList items={filter(tanques)} selected={scope.tanqueIds} onToggle={(id) => toggle('tanqueIds', id)} /></TabsContent>
          <TabsContent value="analises"><ItemList items={filter(analises)} selected={scope.analiseIds} onToggle={(id) => toggle('analiseIds', id)} /></TabsContent>
        </Tabs>

        {showPrebuilt && (
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Blocos prontos para incluir (opcional)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <PbOption id="titulo" label="Título + data" checked={prebuilt.includes('titulo')} onToggle={togglePb} />
              {scope.equipamentoIds.length > 0 && <>
                <PbOption id="kpi_24h" label="KPI: Qtd. produzida nas últimas 24h" checked={prebuilt.includes('kpi_24h')} onToggle={togglePb} />
                <PbOption id="kpi_andamento" label="KPI: Produções em andamento" checked={prebuilt.includes('kpi_andamento')} onToggle={togglePb} />
                <PbOption id="tabela_producoes" label="Tabela: Produções do período" checked={prebuilt.includes('tabela_producoes')} onToggle={togglePb} />
                <PbOption id="grafico_producoes" label="Gráfico: Qtd. produzida por ordem" checked={prebuilt.includes('grafico_producoes')} onToggle={togglePb} />
                <PbOption id="tabela_manutencoes" label="Tabela: Ordens de manutenção" checked={prebuilt.includes('tabela_manutencoes')} onToggle={togglePb} />
              </>}
              {scope.tanqueIds.length > 0 && <>
                <PbOption id="tabela_estoque" label="Tabela: Movimentações de estoque" checked={prebuilt.includes('tabela_estoque')} onToggle={togglePb} />
                <PbOption id="tabela_saldos" label="Tabela: Saldo/tanques" checked={prebuilt.includes('tabela_saldos')} onToggle={togglePb} />
              </>}
              {scope.analiseIds.length > 0 && <>
                <PbOption id="tabela_analises" label="Tabela: Análises registradas" checked={prebuilt.includes('tabela_analises')} onToggle={togglePb} />
                <PbOption id="grafico_analises" label="Gráfico: Evolução do resultado" checked={prebuilt.includes('grafico_analises')} onToggle={togglePb} />
              </>}
            </div>
          </div>
        )}

        <DialogFooter>
          <div className="text-xs text-muted-foreground mr-auto self-center">{totalSel} item(s) selecionado(s)</div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { onConfirm(scope, prebuilt); onOpenChange(false) }}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ItemList({ items, selected, onToggle }: { items: Item[]; selected: string[]; onToggle: (id: string) => void }) {
  if (items.length === 0) return <div className="text-xs text-muted-foreground p-6 text-center">Nenhum item.</div>
  return (
    <div className="max-h-72 overflow-auto border rounded divide-y">
      {items.map((i) => (
        <label key={i.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer">
          <Checkbox checked={selected.includes(i.id)} onCheckedChange={() => onToggle(i.id)} />
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{i.label}</div>
            {i.sub && <div className="text-[11px] text-muted-foreground truncate">{i.sub}</div>}
          </div>
        </label>
      ))}
    </div>
  )
}

function PbOption({ id, label, checked, onToggle }: { id: string; label: string; checked: boolean; onToggle: (id: string) => void }) {
  return (
    <label className="flex items-center gap-2 border rounded px-3 py-2 hover:bg-muted cursor-pointer text-sm">
      <Checkbox checked={checked} onCheckedChange={() => onToggle(id)} />
      <span>{label}</span>
    </label>
  )
}
