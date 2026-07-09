import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export async function exportSpreadsheetToPdf(
  el: HTMLElement,
  filename: string,
  orientation: 'portrait' | 'landscape' = 'landscape',
): Promise<void> {
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW
  const imgH = (canvas.height * pageW) / canvas.width
  let heightLeft = imgH
  let position = 0
  const img = canvas.toDataURL('image/png')
  pdf.addImage(img, 'PNG', 0, position, imgW, imgH)
  heightLeft -= pageH
  while (heightLeft > 0) {
    position = heightLeft - imgH
    pdf.addPage()
    pdf.addImage(img, 'PNG', 0, position, imgW, imgH)
    heightLeft -= pageH
  }
  pdf.save(`${filename}.pdf`)
}
