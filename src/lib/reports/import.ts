import * as XLSX from 'xlsx'
import type { Canvas, Block } from './types'

const uid = () => crypto.randomUUID()

const PAGE_W = 794
const PAGE_H = 1123
const MARGIN_X = 40
const MARGIN_Y = 40
const CONTENT_W = PAGE_W - MARGIN_X * 2
const BOTTOM = PAGE_H - MARGIN_Y

type Ctx = { pages: { id: string; blocks: Block[] }[]; y: number }

function newCtx(): Ctx {
  return { pages: [{ id: uid(), blocks: [] }], y: MARGIN_Y }
}

function ensureRoom(ctx: Ctx, h: number) {
  if (ctx.y + h > BOTTOM) {
    ctx.pages.push({ id: uid(), blocks: [] })
    ctx.y = MARGIN_Y
  }
}

function pushText(
  ctx: Ctx,
  text: string,
  opts: { fontSize?: number; bold?: boolean; color?: string; heading?: boolean; align?: 'left' | 'center' | 'right' } = {},
) {
  const fontSize = opts.fontSize ?? 12
  const lineH = Math.round(fontSize * 1.4)
  // rough wrap: ~ (CONTENT_W / (fontSize * 0.55)) chars per line
  const cpl = Math.max(20, Math.floor(CONTENT_W / (fontSize * 0.55)))
  const lines = Math.max(1, Math.ceil(text.length / cpl))
  const h = lineH * lines + 6
  ensureRoom(ctx, h)
  const page = ctx.pages[ctx.pages.length - 1]
  page.blocks.push({
    id: uid(),
    type: opts.heading ? 'heading' : 'text',
    x: MARGIN_X,
    y: ctx.y,
    w: CONTENT_W,
    h,
    props: {
      text,
      fontSize,
      color: opts.color ?? (opts.heading ? '#0f172a' : '#1e293b'),
      bold: opts.bold ?? opts.heading,
      align: opts.align ?? 'left',
    },
  } as Block)
  ctx.y += h + 6
}

function pushDivider(ctx: Ctx, color = '#2563eb') {
  ensureRoom(ctx, 8)
  const page = ctx.pages[ctx.pages.length - 1]
  page.blocks.push({
    id: uid(),
    type: 'divider',
    x: MARGIN_X,
    y: ctx.y,
    w: CONTENT_W,
    h: 8,
    props: { color, thickness: 2 },
  } as Block)
  ctx.y += 14
}

function pushSpacer(ctx: Ctx, h = 12) {
  ctx.y += h
  if (ctx.y > BOTTOM) {
    ctx.pages.push({ id: uid(), blocks: [] })
    ctx.y = MARGIN_Y
  }
}

/** Render a static 2D table as a grid of small text blocks with a header row. */
function pushStaticTable(ctx: Ctx, rows: string[][], headerColor = '#2563eb') {
  if (!rows.length) return
  const cols = Math.max(...rows.map((r) => r.length))
  if (!cols) return
  const colW = Math.floor(CONTENT_W / cols)
  const rowH = 24
  rows.forEach((row, ri) => {
    ensureRoom(ctx, rowH)
    const page = ctx.pages[ctx.pages.length - 1]
    for (let ci = 0; ci < cols; ci++) {
      const cell = (row[ci] ?? '').toString()
      const isHeader = ri === 0
      page.blocks.push({
        id: uid(),
        type: 'text',
        x: MARGIN_X + ci * colW,
        y: ctx.y,
        w: colW,
        h: rowH,
        props: {
          text: cell,
          fontSize: 11,
          color: isHeader ? '#ffffff' : '#0f172a',
          bold: isHeader,
          align: 'left',
        },
      } as Block)
      if (isHeader) {
        // header background via divider trick (thick colored bar behind row)
        page.blocks.unshift({
          id: uid(),
          type: 'divider',
          x: MARGIN_X + ci * colW,
          y: ctx.y,
          w: colW,
          h: rowH,
          z: -1,
          props: { color: headerColor, thickness: rowH },
        } as Block)
      }
    }
    ctx.y += rowH
  })
  ctx.y += 10
}

/* ------------------------- Excel ------------------------- */

export async function importCanvasFromExcel(file: File): Promise<{ nome: string; canvas: Canvas }> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ctx = newCtx()
  const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, '')

  pushText(ctx, baseName, { fontSize: 22, heading: true, color: '#0f172a' })
  pushText(ctx, 'Importado do Excel — edite os blocos conforme necessário.', {
    fontSize: 11,
    color: '#64748b',
  })
  pushDivider(ctx)

  wb.SheetNames.forEach((name, idx) => {
    if (idx > 0) pushSpacer(ctx, 18)
    pushText(ctx, name, { fontSize: 16, heading: true, color: '#2563eb' })
    const sheet = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: '' })
    const cleaned = (rows as any[][])
      .map((r) => r.map((c) => (c == null ? '' : String(c))))
      .filter((r) => r.some((c) => c.trim() !== ''))
    if (cleaned.length === 0) {
      pushText(ctx, '(planilha vazia)', { fontSize: 11, color: '#94a3b8' })
      return
    }
    // limit to first 40 rows / 8 cols to keep the model manageable
    const trimmed = cleaned.slice(0, 40).map((r) => r.slice(0, 8))
    pushStaticTable(ctx, trimmed)
    if (cleaned.length > 40) {
      pushText(ctx, `… ${cleaned.length - 40} linhas adicionais omitidas na importação.`, {
        fontSize: 10,
        color: '#94a3b8',
      })
    }
  })

  return { nome: baseName || 'Modelo importado', canvas: { pages: ctx.pages } }
}

/* ------------------------- PDF ------------------------- */

async function loadPdfJs() {
  const pdfjs: any = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

export async function importCanvasFromPdf(file: File): Promise<{ nome: string; canvas: Canvas }> {
  const pdfjs = await loadPdfJs()
  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const ctx = newCtx()
  const baseName = file.name.replace(/\.pdf$/i, '')

  pushText(ctx, baseName, { fontSize: 22, heading: true, color: '#0f172a' })
  pushText(ctx, 'Importado do PDF — edite os blocos conforme necessário.', {
    fontSize: 11,
    color: '#64748b',
  })
  pushDivider(ctx)

  const maxPages = Math.min(doc.numPages, 20)
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // Group items by their Y position (rounded) to reconstruct lines
    const lines = new Map<number, { x: number; str: string }[]>()
    for (const it of content.items as any[]) {
      const str = it.str as string
      if (!str) continue
      const tr = it.transform as number[]
      const x = tr[4]
      const yKey = Math.round(tr[5])
      if (!lines.has(yKey)) lines.set(yKey, [])
      lines.get(yKey)!.push({ x, str })
    }
    const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0])
    if (p > 1) pushSpacer(ctx, 14)
    pushText(ctx, `Página ${p}`, { fontSize: 14, heading: true, color: '#2563eb' })
    for (const [, parts] of ordered) {
      parts.sort((a, b) => a.x - b.x)
      const text = parts
        .map((p) => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!text) continue
      const isBigLine = text.length < 80 && /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ0-9\s\-:\.]+$/.test(text)
      pushText(ctx, text, isBigLine ? { fontSize: 13, bold: true } : { fontSize: 11 })
    }
  }
  if (doc.numPages > maxPages) {
    pushText(ctx, `… ${doc.numPages - maxPages} páginas adicionais omitidas na importação.`, {
      fontSize: 10,
      color: '#94a3b8',
    })
  }

  return { nome: baseName || 'Modelo importado', canvas: { pages: ctx.pages } }
}

export async function importCanvasFromFile(file: File): Promise<{ nome: string; canvas: Canvas }> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return importCanvasFromPdf(file)
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return importCanvasFromExcel(file)
  throw new Error('Formato não suportado. Use PDF, XLSX, XLS ou CSV.')
}
