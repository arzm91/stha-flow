import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import ExcelJS from 'exceljs'
import { normalizeWorkbook } from './spreadsheet-types'
import type { Workbook, Sheet, CellStyle } from './spreadsheet-types'
import { extractSthaCalls } from './formulas-catalog'
import { resolveOneWithCtx, type ResolveContext } from './formulas.functions'

type GenInput = {
  report_id: string
  ctx?: ResolveContext
  formats?: string[]                  // ['xlsx'] default
  automation_run_id?: string | null
  triggered_by?: 'automation' | 'manual' | 'schedule'
  recipient_email?: string
}

function argbFromHex(hex?: string): string | undefined {
  if (!hex) return undefined
  const h = hex.replace('#', '')
  if (h.length === 6) return `FF${h.toUpperCase()}`
  if (h.length === 8) return h.toUpperCase()
  return undefined
}
function colIndexToLetter(n: number): string {
  let s = ''; n += 1
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

/** Resolve every STHA cell in the workbook, producing a fresh sthaCache per sheet
 *  and a resolved data matrix (formulas replaced by values). Also resolves chart series. */
async function resolveWorkbook(supabase: any, wb: Workbook, ctx?: ResolveContext): Promise<Workbook> {
  for (const sheet of wb.sheets) {
    const newCache: Record<string, string | number> = {}
    // cells
    for (let r = 0; r < sheet.data.length; r++) {
      const row = sheet.data[r]
      for (let c = 0; c < row.length; c++) {
        const v = row[c]
        if (typeof v !== 'string' || !v.startsWith('=') || !/STHA_/.test(v)) continue
        const calls = extractSthaCalls(v)
        for (const call of calls) {
          const res = await resolveOneWithCtx(supabase, call, ctx)
          const key = `${call.name}|${call.args.join('\u0001')}`
          newCache[`${r},${c}`] = (res.value ?? '') as string | number
          // also keep call-level cache for potential future reuse
          newCache[key] = (res.value ?? '') as string | number
        }
      }
    }
    sheet.sthaCache = { ...sheet.sthaCache, ...newCache }
    // chart series
    for (const obj of sheet.objects ?? []) {
      if (obj.kind !== 'chart') continue
      const values: (number | null)[] = []
      for (const s of obj.series) {
        const calls = extractSthaCalls(s.formula.startsWith('=') ? s.formula : `=${s.formula}`)
        let v: number | null = null
        for (const call of calls) {
          const res = await resolveOneWithCtx(supabase, call, ctx)
          const num = Number(res.value)
          if (!isNaN(num)) v = num
        }
        values.push(v)
      }
      obj.values = values
    }
  }
  return wb
}

async function workbookToXlsxBuffer(wb: Workbook): Promise<ArrayBuffer> {
  const out = new ExcelJS.Workbook()
  for (const sh of wb.sheets) {
    const ws = out.addWorksheet(sh.name)
    sh.data.forEach((row: (string|number|null)[], rr: number) => {
      row.forEach((val, cc) => {
        if (val == null || val === '') return
        const cell = ws.getCell(rr + 1, cc + 1)
        if (typeof val === 'string' && val.startsWith('=')) {
          if (/STHA_/.test(val)) {
            const cached = sh.sthaCache[`${rr},${cc}`]
            cell.value = (cached ?? null) as any
          } else {
            cell.value = { formula: val.slice(1) } as any
          }
        } else {
          cell.value = val as any
        }
        const st: CellStyle | undefined = sh.styles[`${rr},${cc}`]
        if (st) {
          const font: any = {}
          if (st.bold) font.bold = true
          if (st.italic) font.italic = true
          if (st.underline) font.underline = true
          if (st.fontSize) font.size = st.fontSize
          if (st.fontFamily) font.name = st.fontFamily
          if (st.color) font.color = { argb: argbFromHex(st.color) }
          if (Object.keys(font).length) cell.font = font
          if (st.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbFromHex(st.bg)! } } as any
          const al: any = {}
          if (st.align) al.horizontal = st.align
          if (st.valign) al.vertical = st.valign
          if (Object.keys(al).length) cell.alignment = al
          if (st.numberFormat) cell.numFmt = st.numberFormat
        }
      })
    })
    sh.colWidths.forEach((w: number, i: number) => { if (w) ws.getColumn(i + 1).width = w / 7 })
    sh.rowHeights.forEach((h: number, i: number) => { if (h) ws.getRow(i + 1).height = h })
    for (const m of sh.mergeCells) {
      const r1 = m.row + 1, c1 = m.col + 1, r2 = r1 + m.rowspan - 1, c2 = c1 + m.colspan - 1
      try { ws.mergeCells(`${colIndexToLetter(c1 - 1)}${r1}:${colIndexToLetter(c2 - 1)}${r2}`) } catch {}
    }
  }
  return (await out.xlsx.writeBuffer()) as ArrayBuffer
}

export async function generateReportRunInternal(
  supabase: any,
  userId: string,
  input: GenInput,
): Promise<{ runId: string; xlsxPath: string | null; signedUrl: string | null }> {
  const { data: report, error: e1 } = await supabase
    .from('report_templates').select('id, nome, workbook').eq('id', input.report_id).maybeSingle()
  if (e1 || !report) throw new Error('Relatório não encontrado')

  const wb: Workbook = normalizeWorkbook(report.workbook)
  await resolveWorkbook(supabase, wb, input.ctx)

  const formats = input.formats && input.formats.length ? input.formats : ['xlsx']

  // Insert run first to get id
  const { data: runRow, error: e2 } = await supabase
    .from('report_runs')
    .insert({
      owner_id: userId,
      report_id: input.report_id,
      status: 'running',
      triggered_by: input.triggered_by ?? 'automation',
      formats,
      context: input.ctx ?? {},
      automation_run_id: input.automation_run_id ?? null,
    })
    .select('id').single()
  if (e2 || !runRow) throw new Error(e2?.message || 'Falha ao registrar execução')
  const runId = runRow.id as string

  let xlsxPath: string | null = null
  let signedUrl: string | null = null
  try {
    if (formats.includes('xlsx') || formats.includes('pdf')) {
      // We always generate an xlsx snapshot; PDF requested is currently downloaded from the
      // report page (browser). The XLSX is the authoritative resolved snapshot.
      const buf = await workbookToXlsxBuffer(wb)
      const safeName = String(report.nome ?? 'relatorio').replace(/[^\w\-]+/g, '_').slice(0, 60)
      xlsxPath = `${userId}/${runId}-${safeName}.xlsx`
      const upload = await supabase.storage.from('reports').upload(xlsxPath, buf, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      })
      if (upload.error) throw new Error(upload.error.message)
      const { data: signed } = await supabase.storage.from('reports').createSignedUrl(xlsxPath, 60 * 60 * 24 * 7)
      signedUrl = signed?.signedUrl ?? null
    }

    await supabase.from('report_runs').update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      xlsx_path: xlsxPath,
      resolved_snapshot: JSON.parse(JSON.stringify(wb)),
    }).eq('id', runId)

    // Optional email
    if (input.recipient_email) {
      const { enqueueTransactionalEmail } = await import('@/lib/email/enqueue.server')
      await enqueueTransactionalEmail({
        templateName: 'report-ready',
        recipientEmail: input.recipient_email,
        templateData: {
          reportTitle: report.nome ?? 'Relatório',
          period: new Date().toLocaleString('pt-BR'),
          downloadUrl: signedUrl ?? 'https://sthapc.cloud/relatorios',
        },
      })
    }
  } catch (err: any) {
    await supabase.from('report_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message: err?.message ?? String(err),
      xlsx_path: xlsxPath,
    }).eq('id', runId)
    throw err
  }

  return { runId, xlsxPath, signedUrl }
}

export const generateReportRun = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GenInput) => input)
  .handler(async ({ data, context }) => {
    return generateReportRunInternal(context.supabase, context.userId, {
      ...data,
      triggered_by: data.triggered_by ?? 'manual',
    })
  })

export const listReportRuns = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { report_id?: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from('report_runs').select('*').order('created_at', { ascending: false }).limit(data.limit ?? 50)
    if (data.report_id) q = q.eq('report_id', data.report_id)
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)
    return (rows ?? []) as Array<Record<string, any>>
  })

export const getReportRunSignedUrl = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string; expiresIn?: number }) => input)
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from('reports').createSignedUrl(data.path, data.expiresIn ?? 60 * 60)
    if (error) throw new Error(error.message)
    return { url: signed.signedUrl }
  })
