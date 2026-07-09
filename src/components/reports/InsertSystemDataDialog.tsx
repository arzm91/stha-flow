import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FORMULAS, type FormulaDef, type FormulaArg } from '@/lib/reports/formulas-catalog'
import { listResolverOptions } from '@/lib/reports/formulas.functions'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  onInsertFormula: (formula: string) => void
  onInsertValue: (formula: string) => void
}

export function InsertSystemDataDialog({ open, onOpenChange, onInsertFormula, onInsertValue }: Props) {
  const listOpts = useServerFn(listResolverOptions)
  const { data: opts } = useQuery({
    queryKey: ['reports', 'resolver-options'],
    queryFn: () => listOpts(),
    enabled: open,
  })
  const [formulaName, setFormulaName] = useState<string>(FORMULAS[0].name)
  const [args, setArgs] = useState<Record<string, string>>({})

  const def = FORMULAS.find((f) => f.name === formulaName) ?? FORMULAS[0]

  useEffect(() => { setArgs({}) }, [formulaName])

  const build = (): string => {
    const parts = def.args.map((a) => `"${(args[a.key] ?? '').replace(/"/g, '')}"`).join(';')
    return `=${def.name}(${parts})`
  }

  const optionsFor = (arg: FormulaArg): { value: string; label: string }[] => {
    if (arg.options) return arg.options
    if (!opts) return []
    switch (arg.kind) {
      case 'equipamento': return (opts.equipamentos ?? []).map((e: any) => ({ value: e.codigo || e.nome, label: `${e.nome}${e.codigo ? ` (${e.codigo})` : ''}` }))
      case 'tanque': return (opts.tanques ?? []).map((t: any) => ({ value: t.codigo || t.nome, label: `${t.nome}${t.codigo ? ` (${t.codigo})` : ''}` }))
      case 'produto': return (opts.produtos ?? []).map((p: any) => ({ value: p.codigo || p.nome, label: `${p.nome}${p.codigo ? ` (${p.codigo})` : ''}` }))
      case 'tag': return (opts.tags ?? []).map((t: any) => ({ value: t.nome, label: t.nome_amigavel || t.nome }))
      case 'analise': return (opts.analises ?? []).map((a: any) => ({ value: a.nome, label: a.nome }))
      default: return []
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Inserir dado do sistema</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Fórmula</Label>
            <Select value={formulaName} onValueChange={setFormulaName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMULAS.map((f) => (
                  <SelectItem key={f.name} value={f.name}>{f.category} — {f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{def.description}</p>
          </div>

          {def.args.map((a) => {
            const list = optionsFor(a)
            return (
              <div key={a.key}>
                <Label>{a.label}{a.optional ? ' (opcional)' : ''}</Label>
                {list.length > 0 ? (
                  <Select value={args[a.key] ?? ''} onValueChange={(v) => setArgs((prev) => ({ ...prev, [a.key]: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {list.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : a.kind === 'date' ? (
                  <Input type="date" value={args[a.key] ?? ''} onChange={(e) => setArgs((p) => ({ ...p, [a.key]: e.target.value }))} />
                ) : a.kind === 'number' ? (
                  <Input type="number" value={args[a.key] ?? ''} onChange={(e) => setArgs((p) => ({ ...p, [a.key]: e.target.value }))} />
                ) : (
                  <Input value={args[a.key] ?? ''} onChange={(e) => setArgs((p) => ({ ...p, [a.key]: e.target.value }))} />
                )}
              </div>
            )
          })}

          <div className="p-2 bg-muted rounded text-xs font-mono break-all">{build()}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onInsertValue(build()); onOpenChange(false) }}>
            Inserir como valor (snapshot)
          </Button>
          <Button onClick={() => { onInsertFormula(build()); onOpenChange(false) }}>
            Inserir fórmula viva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
