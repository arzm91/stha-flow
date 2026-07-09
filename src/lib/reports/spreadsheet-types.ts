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

/** Overlay object anchored on the sheet by pixel position (relative to the grid). */
export type SheetObjectBase = {
  id: string
  x: number
  y: number
  w: number
  h: number
  z?: number
}
export type ImageObject = SheetObjectBase & {
  kind: 'image'
  /** Data URL (base64) so it persists inside the workbook JSON. */
  src: string
  alt?: string
}
export type ShapeObject = SheetObjectBase & {
  kind: 'shape'
  shape: 'rectangle' | 'ellipse' | 'line'
  fill?: string
  stroke?: string
  strokeWidth?: number
  rounded?: number
}
export type ChartSeries = {
  label: string
  /** STHA_* formula (without leading '=') to resolve into a number */
  formula: string
}
export type ChartObject = SheetObjectBase & {
  kind: 'chart'
  chartType: 'bar' | 'line' | 'pie'
  title?: string
  series: ChartSeries[]
  /** cached resolved values, same order as series */
  values?: (number | null)[]
}
export type SheetObject = ImageObject | ShapeObject | ChartObject

export type Sheet = {
  id: string
  name: string
  data: (string | number | null)[][]
  mergeCells: MergeCell[]
  colWidths: number[]
  rowHeights: number[]
  styles: Record<string, CellStyle>
  sthaCache: Record<string, string | number>
  objects: SheetObject[]
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
    id, name, data,
    mergeCells: [], colWidths: [], rowHeights: [],
    styles: {}, sthaCache: {}, objects: [],
  }
}

export function emptyWorkbook(): Workbook {
  const s = emptySheet()
  return { sheets: [s], activeSheetId: s.id }
}

export function normalizeWorkbook(raw: any): Workbook {
  if (!raw || !Array.isArray(raw.sheets) || raw.sheets.length === 0) return emptyWorkbook()
  const sheets: Sheet[] = raw.sheets.map((s: any, i: number) => {
    const data: (string | number | null)[][] = Array.isArray(s.data) ? s.data : []
    while (data.length < DEFAULT_ROWS) data.push(Array.from({ length: DEFAULT_COLS }, () => null))
    for (const row of data) while (row.length < DEFAULT_COLS) row.push(null)
    return {
      id: s.id ?? `s${i + 1}`,
      name: s.name ?? `Planilha${i + 1}`,
      data,
      mergeCells: Array.isArray(s.mergeCells) ? s.mergeCells : [],
      colWidths: Array.isArray(s.colWidths) ? s.colWidths : [],
      rowHeights: Array.isArray(s.rowHeights) ? s.rowHeights : [],
      styles: s.styles ?? {},
      sthaCache: s.sthaCache ?? {},
      objects: Array.isArray(s.objects) ? s.objects : [],
    }
  })
  return { sheets, activeSheetId: raw.activeSheetId ?? sheets[0].id }
}
