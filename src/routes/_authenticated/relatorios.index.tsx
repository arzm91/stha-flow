import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { pageHead } from '@/lib/seo'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { listReports, createReport, deleteReport } from '@/lib/reports/reports.functions'
import { emptyWorkbook } from '@/lib/reports/spreadsheet-types'
import { importXlsx } from '@/lib/reports/xlsx-io'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, FileSpreadsheet, Trash2, Pencil, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/relatorios/')({
  head: pageHead({ title: 'Relatórios — STHApc', description: 'Planilha estilo Excel com dados do sistema.', path: '/relatorios' }),
  component: ReportsListPage,
})

function ReportsListPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const list = useServerFn(listReports)
  const create = useServerFn(createReport)
  const remove = useServerFn(deleteReport)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const handleImportFile = async (file: File) => {
    setImporting(true)
    try {
      const wb = await importXlsx(file)
      const nome = file.name.replace(/\.(xlsx|xls)$/i, '') || 'Modelo importado'
      createMut.mutate({ nome, descricao: `Importado de ${file.name}`, workbook: wb as any })
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao importar arquivo')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Relatórios" description="Monte relatórios em planilha estilo Excel. Chame dados do sistema em qualquer célula, importe modelos .xlsx e exporte em Excel, PDF ou CSV." />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => createMut.mutate({ nome: 'Novo relatório', workbook: emptyWorkbook() as any })}>
            <Plus className="w-4 h-4 mr-1" />Novo relatório
          </Button>
          <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" />
            {importing ? 'Importando…' : 'Importar .xlsx'}
          </Button>
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
          />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : reports.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Nenhum relatório ainda. Crie um novo ou importe um modelo .xlsx.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((r: any) => {
              const isLegacy = !r.workbook || !Array.isArray(r.workbook?.sheets)
              return (
                <Card key={r.id} className="hover:shadow-md transition">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-primary" />{r.nome}
                        </div>
                        {isLegacy && <div className="text-[10px] text-amber-600 mt-1">Relatório antigo — recomendamos recriar</div>}
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
    </div>
  )
}
