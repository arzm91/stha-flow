import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { pageHead } from '@/lib/seo'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { getReport, updateReport } from '@/lib/reports/reports.functions'
import { supabase } from '@/integrations/supabase/client'
import { useEditorStore } from '@/lib/reports/store'
import { PAGE_SIZES } from '@/lib/reports/types'
import type { PageSizeKey } from '@/lib/reports/types'
import { BlockPalette } from '@/components/reports/BlockPalette'
import { PropertiesPanel } from '@/components/reports/PropertiesPanel'
import { CanvasBlock } from '@/components/reports/CanvasBlock'
import { SchedulesDialog } from '@/components/reports/SchedulesDialog'
import { exportCanvasToPdf, exportTablesToCsv } from '@/lib/reports/export'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Save, FileDown, CalendarClock, Undo2, Redo2, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/relatorios/$id')({
  head: pageHead({ title: 'Editor de Relatório — STHApc', description: 'Editor visual de relatórios', path: '/relatorios' }),
  component: ReportEditorPage,
})

function ReportEditorPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const getFn = useServerFn(getReport)
  const updateFn = useServerFn(updateReport)

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', id],
    queryFn: () => getFn({ data: { id } }),
  })

  const setCanvas = useEditorStore((s) => s.setCanvas)
  const setTheme = useEditorStore((s) => s.setTheme)
  const canvas = useEditorStore((s) => s.canvas)
  const theme = useEditorStore((s) => s.theme)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const select = useEditorStore((s) => s.select)

  const [nome, setNome] = useState('')
  const [pageSize, setPageSize] = useState<PageSizeKey>('A4')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [schedulesOpen, setSchedulesOpen] = useState(false)
  const [ownerId, setOwnerId] = useState<string>('')
  const [userName, setUserName] = useState<string>('')
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!report) return
    setNome(report.nome)
    setPageSize(report.page_size as PageSizeKey)
    setOrientation(report.orientation)
    setCanvas(report.canvas, false)
    setTheme(report.theme)
  }, [report, setCanvas, setTheme])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      setUserName(data.user.email ?? '')
      const { data: prof } = await supabase.from('profiles').select('nome, created_by').eq('id', data.user.id).maybeSingle()
      setUserName((prof?.nome as string) || data.user.email || '')
      setOwnerId((prof?.created_by as string) || data.user.id)
    })
  }, [])

  const save = useMutation({
    mutationFn: () => updateFn({ data: { id, nome, canvas, theme, page_size: pageSize, orientation } }),
    onSuccess: () => { toast.success('Salvo'); qc.invalidateQueries({ queryKey: ['report', id] }); qc.invalidateQueries({ queryKey: ['reports'] }) },
    onError: (e: any) => toast.error(e.message),
  })

  const dynamicValues: Record<string, string> = {
    data_hoje: new Date().toLocaleDateString('pt-BR'),
    hora_agora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    usuario_nome: userName,
    empresa_nome: '',
    relatorio_nome: nome,
  }

  const size = PAGE_SIZES[pageSize][orientation]

  if (isLoading || !report) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="border-b bg-card px-3 py-2 flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/relatorios' })}><ArrowLeft className="w-4 h-4" /></Button>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="max-w-xs h-8" placeholder="Nome do relatório" />
        <Select value={pageSize} onValueChange={(v) => setPageSize(v as PageSizeKey)}>
          <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="A4">A4</SelectItem><SelectItem value="Letter">Letter</SelectItem></SelectContent>
        </Select>
        <Select value={orientation} onValueChange={(v) => setOrientation(v as any)}>
          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="portrait">Retrato</SelectItem><SelectItem value="landscape">Paisagem</SelectItem></SelectContent>
        </Select>
        <div className="flex items-center gap-1 ml-2">
          <input type="color" value={theme.primary} onChange={(e) => setTheme({ ...theme, primary: e.target.value })} className="w-8 h-8 rounded border" title="Cor primária" />
        </div>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={undo}><Undo2 className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={redo}><Redo2 className="w-4 h-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setSchedulesOpen(true)}><CalendarClock className="w-4 h-4 mr-1" />Agendas</Button>
        <Button variant="outline" size="sm" onClick={() => exportTablesToCsv(canvas, nome || 'relatorio')}><FileSpreadsheet className="w-4 h-4 mr-1" />CSV</Button>
        <Button variant="outline" size="sm" onClick={() => { if (canvasRef.current) exportCanvasToPdf(canvasRef.current, nome || 'relatorio') }}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Save className="w-4 h-4 mr-1" />Salvar</Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left palette */}
        <div className="w-56 border-r overflow-y-auto bg-card"><BlockPalette /></div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-slate-100 p-8" onClick={() => select(null)}>
          <div
            ref={canvasRef}
            className="mx-auto bg-white shadow-lg relative"
            style={{ width: size.w, height: size.h, fontFamily: theme.font }}
            onClick={(e) => e.stopPropagation()}
          >
            {canvas.pages[0]?.blocks.map((b) => (
              <CanvasBlock key={b.id} block={b} dynamicValues={dynamicValues} />
            ))}
          </div>
        </div>

        {/* Right props */}
        <div className="w-72 border-l overflow-y-auto bg-card">
          <PropertiesPanel effectiveOwnerId={ownerId} />
        </div>
      </div>

      <SchedulesDialog open={schedulesOpen} onOpenChange={setSchedulesOpen} reportId={id} />
    </div>
  )
}
