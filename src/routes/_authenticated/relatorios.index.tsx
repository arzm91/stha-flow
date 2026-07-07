import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { pageHead } from '@/lib/seo'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { listReports, createReport, deleteReport } from '@/lib/reports/reports.functions'
import { SEED_TEMPLATES } from '@/lib/reports/seed-templates'
import { buildPrebuiltCanvas } from '@/lib/reports/prebuilt'
import { ScopePickerDialog } from '@/components/reports/ScopePickerDialog'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, FileText, Trash2, Wand2, Pencil, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { importCanvasFromFile } from '@/lib/reports/import'

export const Route = createFileRoute('/_authenticated/relatorios/')({
  head: pageHead({ title: 'Relatórios — STHApc', description: 'Crie, edite e agende relatórios visuais com dados do sistema.', path: '/relatorios' }),
  component: ReportsListPage,
})

function ReportsListPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const list = useServerFn(listReports)
  const create = useServerFn(createReport)
  const remove = useServerFn(deleteReport)
  const [modelOpen, setModelOpen] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImportFile = async (file: File) => {
    setImporting(true)
    try {
      const { nome, canvas } = await importCanvasFromFile(file)
      createMut.mutate({ nome, descricao: `Modelo importado de ${file.name}`, canvas })
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao importar arquivo')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const { data: reports = [], isLoading } = useQuery({ queryKey: ['reports'], queryFn: () => list() })

  const createMut = useMutation({
    mutationFn: (input: any) => create({ data: input }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['reports'] }); navigate({ to: '/relatorios/$id', params: { id: r.id } }) },
    onError: (e: any) => toast.error(e.message),
  })
  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }); toast.success('Excluído') },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Relatórios" description="Escolha o escopo (equipamentos, produtos, tanques, análises) e monte relatórios visuais com dados filtrados automaticamente." />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setScopeOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />Novo relatório
          </Button>
          <Button variant="outline" onClick={() => setModelOpen(true)}>
            <Wand2 className="w-4 h-4 mr-1" />A partir de modelo
          </Button>
          <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" />
            {importing ? 'Importando…' : 'Importar PDF / Excel'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImportFile(f)
            }}
          />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : reports.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Nenhum relatório ainda. Clique em "Novo relatório" para escolher o escopo.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((r: any) => {
              const totalScope = (r.equipamento_ids?.length ?? 0) + (r.produto_ids?.length ?? 0) + (r.tanque_ids?.length ?? 0) + (r.analise_ids?.length ?? 0)
              return (
                <Card key={r.id} className="hover:shadow-md transition">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold">{r.nome}</div>
                        <div className="flex gap-1 flex-wrap mt-1">
                          <Badge variant="secondary" className="capitalize">{r.tipo}</Badge>
                          {totalScope > 0 && <Badge variant="outline">{totalScope} escopo</Badge>}
                        </div>
                      </div>
                    </div>
                    {r.descricao && <div className="text-xs text-muted-foreground line-clamp-2">{r.descricao}</div>}
                    <div className="text-[11px] text-muted-foreground">Atualizado: {new Date(r.updated_at).toLocaleString('pt-BR')}</div>
                    <div className="flex gap-2 pt-2">
                      <Button asChild size="sm" className="flex-1"><Link to="/relatorios/$id" params={{ id: r.id }}><Pencil className="w-3 h-3 mr-1" />Abrir</Link></Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm('Excluir este relatório?')) delMut.mutate(r.id) }}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <ScopePickerDialog
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        showPrebuilt
        confirmLabel="Criar relatório"
        onConfirm={(scope, prebuilt) => {
          const canvas = buildPrebuiltCanvas(scope, prebuilt)
          createMut.mutate({
            nome: 'Novo relatório',
            equipamento_ids: scope.equipamentoIds,
            produto_ids: scope.produtoIds,
            tanque_ids: scope.tanqueIds,
            analise_ids: scope.analiseIds,
            canvas,
          })
        }}
      />

      <Dialog open={modelOpen} onOpenChange={setModelOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Escolha um modelo</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {SEED_TEMPLATES.map((t) => (
              <button key={t.key} type="button"
                className="w-full text-left border rounded p-3 hover:bg-muted transition"
                onClick={() => { setModelOpen(false); createMut.mutate({ nome: t.nome, descricao: t.descricao, tipo: t.tipo, theme: t.theme, canvas: t.canvas }) }}>
                <div className="font-medium">{t.nome}</div>
                <div className="text-xs text-muted-foreground">{t.descricao}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
