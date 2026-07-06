import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Row } from "./types";

function safeFilename(s: string): string {
  return s.replace(/[^\w\-]+/g, "_").slice(0, 80) || "relatorio";
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleString("pt-BR");
  if (typeof v === "string" && /\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("pt-BR");
  }
  if (typeof v === "number") return v.toLocaleString("pt-BR");
  return String(v);
}

export function exportCsv(name: string, headers: string[], keys: string[], rows: Row[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const body = [headers.map(esc).join(";")];
  for (const r of rows) body.push(keys.map((k) => esc(fmtCell(r[k]))).join(";"));
  const blob = new Blob(["\uFEFF" + body.join("\n")], { type: "text/csv;charset=utf-8" });
  download(blob, safeFilename(name) + ".csv");
}

export async function exportXlsx(
  name: string,
  headers: string[],
  keys: string[],
  rows: Row[],
  meta: { fonte: string; filtros: Array<[string, string]> },
  chartPng?: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "STHApc";
  const s1 = wb.addWorksheet("Dados");
  s1.columns = keys.map((k, i) => ({ header: headers[i], key: k, width: Math.min(Math.max(headers[i].length + 2, 14), 40) }));
  for (const r of rows) {
    const row: Row = {};
    for (const k of keys) row[k] = fmtCell(r[k]);
    s1.addRow(row);
  }
  s1.getRow(1).font = { bold: true };
  s1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
  s1.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const s2 = wb.addWorksheet("Filtros");
  s2.addRow(["Relatório", name]);
  s2.addRow(["Fonte", meta.fonte]);
  s2.addRow(["Gerado em", new Date().toLocaleString("pt-BR")]);
  s2.addRow([]);
  s2.addRow(["Filtro", "Valor"]).font = { bold: true } as never;
  for (const [k, v] of meta.filtros) s2.addRow([k, v]);
  s2.getColumn(1).width = 24;
  s2.getColumn(2).width = 60;

  if (chartPng) {
    const s3 = wb.addWorksheet("Gráfico");
    const base64 = chartPng.split(",")[1];
    const imgId = wb.addImage({ base64, extension: "png" });
    s3.addImage(imgId, { tl: { col: 0, row: 1 }, ext: { width: 900, height: 480 } });
  }

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), safeFilename(name) + ".xlsx");
}

export function exportPdf(
  name: string,
  headers: string[],
  keys: string[],
  rows: Row[],
  meta: { fonte: string; filtros: Array<[string, string]> },
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(name, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Fonte: ${meta.fonte}   ·   Gerado em ${new Date().toLocaleString("pt-BR")}`, 40, 56);
  const filtrosTxt = meta.filtros.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("   ·   ");
  if (filtrosTxt) doc.text(filtrosTxt, 40, 70);

  autoTable(doc, {
    startY: 84,
    head: [headers],
    body: rows.map((r) => keys.map((k) => fmtCell(r[k]))),
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: 40, right: 40 },
  });

  doc.save(safeFilename(name) + ".pdf");
}
