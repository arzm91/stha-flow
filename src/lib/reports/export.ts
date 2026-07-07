import Papa from 'papaparse'
import type { Block, Canvas } from '@/lib/reports/types'
import { fetchReportData } from '@/lib/reports/data-source.functions'

/**
 * Gera o PDF via `window.print()` em uma janela isolada.
 *
 * Motivação: bibliotecas baseadas em `html2canvas` (html2pdf.js, jsPDF+html2canvas)
 * NÃO conseguem interpretar cores modernas do Tailwind v4 (`oklch()`, `oklab()`,
 * `color-mix()`), o que travava a aba inteira ao clicar em "Exportar PDF".
 *
 * Ao clonar o canvas do relatório dentro de uma nova janela e disparar
 * `window.print()`, delegamos a geração ao motor nativo do navegador, que
 * respeita as cores, é rápido e permite ao usuário escolher "Salvar como PDF".
 */
export async function exportCanvasToPdf(element: HTMLElement, fileName: string) {
  // 1. Clona o nó com estilos inline copiados (para funcionar isolado numa nova janela)
  const cloned = cloneWithComputedStyles(element)

  // 2. Coleta todos os <link rel="stylesheet"> e <style> da página atual
  const headStyles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('\n')

  const width = element.offsetWidth
  const height = element.offsetHeight

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(fileName)}</title>
${headStyles}
<style>
  @page { size: ${width}px ${height}px; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-canvas { width: ${width}px; height: ${height}px; position: relative; overflow: hidden; background: #fff; }
  @media print {
    body { margin: 0; }
    .print-canvas { box-shadow: none !important; page-break-after: always; }
  }
</style>
</head>
<body>
<div class="print-canvas">${cloned.outerHTML}</div>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=900,height=1200')
  if (!printWindow) {
    throw new Error('O navegador bloqueou a janela de impressão. Autorize pop-ups deste site e tente novamente.')
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()

  // Aguarda imagens carregarem antes de imprimir
  await new Promise<void>((resolve) => {
    const imgs = Array.from(printWindow.document.images)
    if (imgs.length === 0) return resolve()
    let pending = imgs.length
    const done = () => { pending -= 1; if (pending <= 0) resolve() }
    imgs.forEach((img) => {
      if (img.complete) done()
      else { img.addEventListener('load', done); img.addEventListener('error', done) }
    })
    // fail-safe
    setTimeout(resolve, 3000)
  })

  printWindow.focus()
  printWindow.print()
  // Fecha após um pequeno delay para o diálogo abrir
  setTimeout(() => { try { printWindow.close() } catch { /* ignore */ } }, 500)
}

/**
 * Clona o elemento copiando os estilos computados relevantes para que o layout
 * (posições absolutas, tamanhos, cores, fontes) se preserve na janela nova.
 */
function cloneWithComputedStyles(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement
  const originals = collectDescendants(source)
  const clones = collectDescendants(clone)
  const len = Math.min(originals.length, clones.length)
  for (let i = 0; i < len; i++) copyStyle(originals[i], clones[i])
  copyStyle(source, clone)
  return clone
}

function collectDescendants(root: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let n: Node | null = walker.nextNode()
  while (n) {
    if (n instanceof HTMLElement) result.push(n)
    n = walker.nextNode()
  }
  return result
}

const STYLE_PROPS = [
  'position', 'left', 'top', 'right', 'bottom', 'width', 'height',
  'display', 'flex-direction', 'align-items', 'justify-content', 'gap',
  'padding', 'margin', 'border', 'border-radius', 'box-sizing',
  'background', 'background-color', 'color', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'text-align', 'text-decoration', 'white-space', 'overflow',
  'object-fit', 'transform', 'z-index',
]

function copyStyle(from: HTMLElement, to: HTMLElement) {
  const cs = window.getComputedStyle(from)
  let inline = ''
  for (const prop of STYLE_PROPS) {
    const v = cs.getPropertyValue(prop)
    if (v) inline += `${prop}:${v};`
  }
  const existing = to.getAttribute('style') ?? ''
  to.setAttribute('style', `${inline}${existing}`)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!))
}

/* ------------------------------------------------------------------ */
/* CSV export com dados reais                                          */
/* ------------------------------------------------------------------ */

type ScopeCtx = {
  equipamentoIds?: string[]
  produtoIds?: string[]
  tanqueIds?: string[]
  analiseIds?: string[]
}

/**
 * Percorre todos os blocos de tabela do canvas, busca os dados reais via
 * `fetchReportData` (respeitando o escopo do relatório) e gera um CSV por
 * tabela. Antes esta função exportava apenas os cabeçalhos.
 */
export async function exportTablesToCsv(canvas: Canvas, fileName: string, scope?: ScopeCtx) {
  const tables: Block[] = []
  for (const p of canvas.pages) for (const b of p.blocks) if (b.type === 'table') tables.push(b)
  if (tables.length === 0) {
    throw new Error('Nenhuma tabela encontrada no relatório para exportar.')
  }

  for (let idx = 0; idx < tables.length; idx++) {
    const t = tables[idx]
    const props: any = (t as any).props
    const ds = props?.dataSource
    const cols: string[] = ds?.columns ?? []

    if (!ds?.source || cols.length === 0) {
      // Sem fonte configurada — exporta cabeçalho vazio para o usuário perceber
      downloadCsv(Papa.unparse({ fields: cols, data: [] }), `${fileName}-tabela-${idx + 1}.csv`)
      continue
    }

    const effective = {
      ...ds,
      scope: ds.useScope === false ? undefined : {
        equipamentoIds: scope?.equipamentoIds ?? [],
        produtoIds: scope?.produtoIds ?? [],
        tanqueIds: scope?.tanqueIds ?? [],
        analiseIds: scope?.analiseIds ?? [],
      },
    }

    const { rows } = await fetchReportData({ data: effective })
    const data = (rows ?? []).map((r) => cols.map((c) => normalizeCell(r?.[c])))
    const csv = Papa.unparse({ fields: cols, data })
    downloadCsv(csv, `${fileName}-tabela-${idx + 1}.csv`)
  }
}

function normalizeCell(v: unknown): string | number {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' || typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function downloadCsv(csv: string, filename: string) {
  // BOM para Excel reconhecer UTF-8
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
