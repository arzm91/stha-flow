export type CellStyle = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  bg?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  fontSize?: number
  fontFamily?: string
  numberFormat?: string
  border?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean }
}

export type MergeCell = { row: number; col: number; rowspan: number; colspan: number }

export type Sheet = {
  id: string
  name: string
  // Raw cell values / formulas typed by user. `null` = empty. Strings starting with `=` are formulas.
  data: (string | number | null)[][]
  mergeCells: MergeCell[]
  colWidths: number[]
  rowHeights: number[]
  // key = "r,c" -> CellStyle
  styles: Record<string, CellStyle>
  // key = "r,c" -> resolved STHA value cache (for display when offline / on load)
  sthaCache: Record<string, string | number>
}

export type Workbook = {
  sheets: Sheet[]
  activeSheetId: string
}

export const DEFAULT_ROWS = 100
export const DEFAULT_COLS = 26

export function emptySheet(id = 's1', name = 'Planilha1'): Sheet {
  const data: (string | number | null)[][] = Array.from({ length: DEFAULT_ROWS }, () =>
    Array.from({ length: DEFAULT_COLS }, () => null),
  )
  return {
    id,
    name,
    data,
    mergeCells: [],
    colWidths: [],
    rowHeights: [],
    styles: {},
    sthaCache: {},
  }
}

export function emptyWorkbook(): Workbook {
  const s = emptySheet()
  return { sheets: [s], activeSheetId: s.id }
}

/** Ensure a workbook loaded from DB has all fields (retro-compat). */
export function normalizeWorkbook(raw: any): Workbook {
  if (!raw || !Array.isArray(raw.sheets) || raw.sheets.length === 0) return emptyWorkbook()
  const sheets: Sheet[] = raw.sheets.map((s: any, i: number) => {
    const data: (string | number | null)[][] = Array.isArray(s.data) ? s.data : []
    // Ensure minimum size
    while (data.length < DEFAULT_ROWS) data.push(Array.from({ length: DEFAULT_COLS }, () => null))
    for (const row of data) {
      while (row.length < DEFAULT_COLS) row.push(null)
    }
    return {
      id: s.id ?? `s${i + 1}`,
      name: s.name ?? `Planilha${i + 1}`,
      data,
      mergeCells: Array.isArray(s.mergeCells) ? s.mergeCells : [],
      colWidths: Array.isArray(s.colWidths) ? s.colWidths : [],
      rowHeights: Array.isArray(s.rowHeights) ? s.rowHeights : [],
      styles: s.styles ?? {},
      sthaCache: s.sthaCache ?? {},
    }
  })
  return { sheets, activeSheetId: raw.activeSheetId ?? sheets[0].id }
}
