import ExcelJS from 'exceljs'
import type { Workbook, Sheet, CellStyle } from './spreadsheet-types'
import { emptySheet, DEFAULT_ROWS, DEFAULT_COLS } from './spreadsheet-types'

function argbFromHex(hex?: string): string | undefined {
  if (!hex) return undefined
  const h = hex.replace('#', '')
  if (h.length === 6) return `FF${h.toUpperCase()}`
  if (h.length === 8) return h.toUpperCase()
  return undefined
}
function hexFromArgb(argb?: string): string | undefined {
  if (!argb) return undefined
  const h = argb.length === 8 ? argb.slice(2) : argb
  return `#${h.toLowerCase()}`
}

/** Read .xlsx into internal Workbook, preserving values, formulas and basic styles. */
export async function importXlsx(file: File): Promise<Workbook> {
  const wb = new ExcelJS.Workbook()
  const buf = await file.arrayBuffer()
  await wb.xlsx.load(buf)
  const sheets: Sheet[] = []
  wb.eachSheet((ws, idx) => {
    const sheet = emptySheet(`s${idx}`, ws.name || `Planilha${idx}`)
    const maxRow = Math.max(ws.rowCount, DEFAULT_ROWS)
    const maxCol = Math.max(ws.columnCount, DEFAULT_COLS)
    // Grow arrays if needed
    while (sheet.data.length < maxRow) sheet.data.push(Array.from({ length: maxCol }, () => null))
    for (const row of sheet.data) while (row.length < maxCol) row.push(null)

    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const rr = r - 1
        const cc = c - 1
        let value: string | number | null = null
        if (cell.formula) {
          value = `=${cell.formula}`
        } else if (cell.value == null) {
          value = null
        } else if (typeof cell.value === 'object') {
          const v: any = cell.value
          if (v.richText) value = v.richText.map((t: any) => t.text).join('')
          else if (v.text) value = v.text
          else if (v.result != null) value = v.result
          else if (v instanceof Date) value = v.toISOString()
          else value = String(cell.value)
        } else if (cell.value instanceof Date) {
          value = (cell.value as Date).toISOString()
        } else {
          value = cell.value as any
        }
        sheet.data[rr][cc] = value
        // Style
        const st: CellStyle = {}
        const f = cell.font
        if (f) {
          if (f.bold) st.bold = true
          if (f.italic) st.italic = true
          if (f.underline) st.underline = true
          if (f.size) st.fontSize = f.size
          if (f.name) st.fontFamily = f.name
          if (f.color && (f.color as any).argb) st.color = hexFromArgb((f.color as any).argb)
        }
        const fill: any = cell.fill
        if (fill && fill.type === 'pattern' && fill.fgColor?.argb) {
          st.bg = hexFromArgb(fill.fgColor.argb)
        }
        const al = cell.alignment
        if (al) {
          if (al.horizontal === 'left' || al.horizontal === 'right' || al.horizontal === 'center') st.align = al.horizontal
          if (al.vertical === 'top' || al.vertical === 'middle' || al.vertical === 'bottom') st.valign = al.vertical
        }
        if (cell.numFmt) st.numberFormat = cell.numFmt
        if (Object.keys(st).length) sheet.styles[`${rr},${cc}`] = st
      })
    })
    // Column widths
    ws.columns.forEach((col: any, i: number) => {
      if (col?.width) sheet.colWidths[i] = Math.round(col.width * 7)
    })
    // Row heights
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (row.height) sheet.rowHeights[r - 1] = row.height
    })
    // Merges
    const merges = (ws as any).model?.merges as string[] | undefined
    if (Array.isArray(merges)) {
      for (const range of merges) {
        // e.g. "B2:D4"
        const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
        if (!m) continue
        const c1 = colLetterToIndex(m[1])
        const r1 = Number(m[2]) - 1
        const c2 = colLetterToIndex(m[3])
        const r2 = Number(m[4]) - 1
        sheet.mergeCells.push({ row: r1, col: c1, rowspan: r2 - r1 + 1, colspan: c2 - c1 + 1 })
      }
    }
    sheets.push(sheet)
  })
  if (!sheets.length) sheets.push(emptySheet())
  return { sheets, activeSheetId: sheets[0].id }
}

function colLetterToIndex(l: string): number {
  let n = 0
  for (let i = 0; i < l.length; i++) n = n * 26 + (l.charCodeAt(i) - 64)
  return n - 1
}
function colIndexToLetter(n: number): string {
  let s = ''
  n += 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Export internal Workbook to .xlsx blob. STHA formulas are exported as their cached values. */
export async function exportXlsx(workbook: Workbook, filename: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  for (const sh of workbook.sheets) {
    const ws = wb.addWorksheet(sh.name)
    sh.data.forEach((row, rr) => {
      row.forEach((val, cc) => {
        if (val == null || val === '') return
        const cell = ws.getCell(rr + 1, cc + 1)
        if (typeof val === 'string' && val.startsWith('=')) {
          if (/STHA_/.test(val)) {
            // Export cached value instead of unknown function
            const cached = sh.sthaCache[`${rr},${cc}`]
            cell.value = cached ?? null
          } else {
            cell.value = { formula: val.slice(1) } as any
          }
        } else {
          cell.value = val as any
        }
        const st = sh.styles[`${rr},${cc}`]
        if (st) {
          const font: any = {}
          if (st.bold) font.bold = true
          if (st.italic) font.italic = true
          if (st.underline) font.underline = true
          if (st.fontSize) font.size = st.fontSize
          if (st.fontFamily) font.name = st.fontFamily
          if (st.color) font.color = { argb: argbFromHex(st.color) }
          if (Object.keys(font).length) cell.font = font
          if (st.bg) {
            cell.fill = {
              type: 'pattern', pattern: 'solid',
              fgColor: { argb: argbFromHex(st.bg)! },
            } as any
          }
          const al: any = {}
          if (st.align) al.horizontal = st.align
          if (st.valign) al.vertical = st.valign
          if (Object.keys(al).length) cell.alignment = al
          if (st.numberFormat) cell.numFmt = st.numberFormat
        }
      })
    })
    sh.colWidths.forEach((w, i) => { if (w) ws.getColumn(i + 1).width = w / 7 })
    sh.rowHeights.forEach((h, i) => { if (h) ws.getRow(i + 1).height = h })
    for (const m of sh.mergeCells) {
      const r1 = m.row + 1
      const c1 = m.col + 1
      const r2 = r1 + m.rowspan - 1
      const c2 = c1 + m.colspan - 1
      try {
        ws.mergeCells(`${colIndexToLetter(c1 - 1)}${r1}:${colIndexToLetter(c2 - 1)}${r2}`)
      } catch {}
    }
  }
  const out = await wb.xlsx.writeBuffer()
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  downloadBlob(blob, `${filename}.xlsx`)
}

export function exportCsv(sheet: Sheet, filename: string): void {
  const rows: string[] = []
  const nCols = sheet.data[0]?.length ?? 0
  // Trim trailing empty rows/cols
  let maxUsedRow = -1, maxUsedCol = -1
  sheet.data.forEach((row, r) => row.forEach((v, c) => {
    if (v != null && v !== '') { if (r > maxUsedRow) maxUsedRow = r; if (c > maxUsedCol) maxUsedCol = c }
  }))
  const rMax = Math.max(0, maxUsedRow + 1)
  const cMax = Math.max(0, Math.min(nCols, maxUsedCol + 1))
  for (let r = 0; r < rMax; r++) {
    const line: string[] = []
    for (let c = 0; c < cMax; c++) {
      let val = sheet.data[r]?.[c]
      if (typeof val === 'string' && val.startsWith('=') && /STHA_/.test(val)) {
        val = (sheet.sthaCache[`${r},${c}`] as any) ?? ''
      }
      const s = val == null ? '' : String(val)
      line.push(/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    }
    rows.push(line.join(';'))
  }
  const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, `${filename}.csv`)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
