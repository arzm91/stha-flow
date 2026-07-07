import Papa from 'papaparse'
import type { Block, Canvas } from '@/lib/reports/types'

export async function exportCanvasToPdf(element: HTMLElement, fileName: string) {
  const html2pdf = (await import('html2pdf.js')).default
  await html2pdf().set({
    margin: 0,
    filename: `${fileName}.pdf`,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'px', format: [element.offsetWidth, element.offsetHeight], orientation: 'portrait' },
  }).from(element).save()
}

export function exportTablesToCsv(canvas: Canvas, fileName: string) {
  const tables: Block[] = []
  for (const p of canvas.pages) for (const b of p.blocks) if (b.type === 'table') tables.push(b)
  if (tables.length === 0) return
  tables.forEach((t, idx) => {
    const props: any = (t as any).props
    const cols = props.dataSource?.columns ?? []
    const csv = Papa.unparse({ fields: cols, data: [] })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileName}-tabela-${idx + 1}.csv`
    a.click()
    URL.revokeObjectURL(url)
  })
}
