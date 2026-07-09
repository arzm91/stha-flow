import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { pageHead } from '@/lib/seo'
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { getReport, updateReport } from '@/lib/reports/reports.functions'
import { normalizeWorkbook, type Workbook, type CellStyle } from '@/lib/reports/spreadsheet-types'
import { importXlsx, exportXlsx, exportCsv } from '@/lib/reports/xlsx-io'
import { exportSpreadsheetToPdf } from '@/lib/reports/pdf-export-sheet'
import { InsertSystemDataDialog } from '@/components/reports/InsertSystemDataDialog'
import { SchedulesDialog } from '@/components/reports/SchedulesDialog'
import type { SpreadsheetEditorHandle } from '@/components/reports/SpreadsheetEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft, Save, FileDown, CalendarClock, FileSpreadsheet,
  Upload, RefreshCw, Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight, Plus, Database,
} from 'lucide-react'
import { toast } from 'sonner'

const SpreadsheetEditor = lazy(() => import('@/components/reports/SpreadsheetEditor').then((m) => ({ default: m.SpreadsheetEditor })))

export const Route = createFileRoute('/_authenticated/relatorios/$id')({
  head: pageHead({ title: 'Editor de Relatório — STHApc', description: 'Editor em planilha de relatórios', path: '/relatorios' }),
  component: ReportEditorPage,
})

function ReportEditorPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const getFn = useServerFn(getReport)
  const updateFn = useServerFn(updateReport)

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', id], queryFn: () => getFn({ data: { id } }),
  })

  const [nome, setNome] = useState('')
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [schedulesOpen, setSchedulesOpen] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const editorRef = useRef<SpreadsheetEditorHandle>(null)
  const gridWrapperRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!report) return
    setNome(report.nome)
    setWorkbook(normalizeWorkbook(report.workbook))
  }, [report])

  const save = useMutation({
    mutationFn: async () => {
      const wb = editorRef.current?.getWorkbook() ?? workbook
      return updateFn({ data: { id, nome, workbook: wb as any } })
    },
    onSuccess: () => { toast.success('Salvo'); qc.invalidateQueries({ queryKey: ['report', id] }); qc.invalidateQueries({ queryKey: ['reports'] }) },
    onError: (e: any) => toast.error(e.message),
  })

  const doExportXlsx = async () => {
    const wb = editorRef.current?.getWorkbook() ?? workbook
    if (!wb) return
    try { await exportXlsx(wb, nome || 'relatorio'); toast.success('Excel gerado') }
    catch (e: any) { toast.error(e?.message ?? 'Falha ao exportar') }
  }
  const doExportCsv = () => {
    const wb = editorRef.current?.getWorkbook() ?? workbook
    if (!wb) return
    const active = wb.sheets.find((s) => s.id === wb.activeSheetId) ?? wb.sheets[0]
    exportCsv(active, nome || 'relatorio')
    toast.success('CSV gerado')
  }
  const doExportPdf = async () => {
    if (!gridWrapperRef.current) return
    try { await exportSpreadsheetToPdf(gridWrapperRef.current, nome || 'relatorio'); toast.success('PDF gerado') }
    catch (e: any) { toast.error(e?.message ?? 'Falha ao gerar PDF') }
  }
  const doImportXlsx = async (file: File) => {
    try {
      const wb = await importXlsx(file)
      setWorkbook(wb)
      toast.success('Importado. Salve para persistir.')
    } catch (e: any) { toast.error(e?.message ?? 'Falha ao importar') }
    finally { if (importRef.current) importRef.current.value = '' }
  }

  const applyStyle = (patch: Partial<CellStyle>) => editorRef.current?.applyStyleToSelection(patch)

  if (isLoading || !report || !workbook) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar principal */}
      <div className="border-b bg-card px-3 py-2 flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/relatorios' })}><ArrowLeft className="w-4 h-4" /></Button>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="max-w-xs h-8" placeholder="Nome do relatório" />
        <Button variant="outline" size="sm" onClick={() => setInsertOpen(true)}>
          <Database className="w-4 h-4 mr-1" />Inserir dado do sistema
        </Button>
        <Button variant="ghost" size="sm" onClick={() => editorRef.current?.recalcSthaAll()}>
          <RefreshCw className="w-4 h-4 mr-1" />Recalcular
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}><Upload className="w-4 h-4 mr-1" />Importar</Button>
        <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) doImportXlsx(f) }} />
        <Button variant="outline" size="sm" onClick={() => setSchedulesOpen(true)}><CalendarClock className="w-4 h-4 mr-1" />Agendas</Button>
        <Button variant="outline" size="sm" onClick={doExportCsv}><FileSpreadsheet className="w-4 h-4 mr-1" />CSV</Button>
        <Button variant="outline" size="sm" onClick={doExportXlsx}><FileSpreadsheet className="w-4 h-4 mr-1" />Excel</Button>
        <Button variant="outline" size="sm" onClick={doExportPdf}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Save className="w-4 h-4 mr-1" />Salvar</Button>
      </div>

      {/* Toolbar de formatação */}
      <div className="border-b bg-card px-3 py-1 flex items-center gap-1 flex-wrap">
        <Button variant="ghost" size="sm" title="Negrito" onClick={() => applyStyle({ bold: true })}><Bold className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" title="Itálico" onClick={() => applyStyle({ italic: true })}><Italic className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" title="Sublinhado" onClick={() => applyStyle({ underline: true })}><UnderlineIcon className="w-4 h-4" /></Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button variant="ghost" size="sm" title="Alinhar à esquerda" onClick={() => applyStyle({ align: 'left' })}><AlignLeft className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" title="Centralizar" onClick={() => applyStyle({ align: 'center' })}><AlignCenter className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" title="Alinhar à direita" onClick={() => applyStyle({ align: 'right' })}><AlignRight className="w-4 h-4" /></Button>
        <div className="w-px h-6 bg-border mx-1" />
        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Texto:</span>
          <input type="color" onChange={(e) => applyStyle({ color: e.target.value })} className="w-6 h-6 rounded border cursor-pointer" defaultValue="#000000" />
        </label>
        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Fundo:</span>
          <input type="color" onChange={(e) => applyStyle({ bg: e.target.value })} className="w-6 h-6 rounded border cursor-pointer" defaultValue="#ffffff" />
        </label>
        <div className="w-px h-6 bg-border mx-1" />
        <Button variant="ghost" size="sm" onClick={() => applyStyle({ bold: false, italic: false, underline: false, color: undefined, bg: undefined, align: undefined })}>
          Limpar
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 bg-white" ref={gridWrapperRef}>
        {mounted && (
          <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando planilha…</div>}>
            <SpreadsheetEditor
              ref={editorRef}
              workbook={workbook}
              onChange={setWorkbook}
            />
          </Suspense>
        )}
      </div>

      <SchedulesDialog open={schedulesOpen} onOpenChange={setSchedulesOpen} reportId={id} />
      <InsertSystemDataDialog
        open={insertOpen}
        onOpenChange={setInsertOpen}
        onInsertFormula={(f) => editorRef.current?.insertAtActive(f)}
        onInsertValue={async (f) => {
          // insert formula then resolve — cached value will show
          editorRef.current?.insertAtActive(f)
          setTimeout(() => editorRef.current?.recalcSthaAll(), 0)
        }}
      />
    </div>
  )
}
