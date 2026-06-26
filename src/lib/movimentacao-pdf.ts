import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatNumber } from "@/lib/format";

export type MovimentacaoPdfData = {
  tipo: "saida" | "entrada";
  expedicao?: boolean;
  produto?: { codigo?: string | null; nome?: string | null } | null;
  tanqueOrigem?: { codigo?: string | null; nome?: string | null } | null;
  quantidade: number;
  unidade?: string | null;
  origem?: string | null;
  destino?: string | null;
  ocorridoEm: string;
  responsavel?: string | null;
  analises?: Array<{
    nome: string;
    unidade?: string | null;
    resultado: number;
    valor_min?: number | null;
    valor_max?: number | null;
    registrado_em: string;
    observacao?: string | null;
  }>;
};

export function gerarRelatorioMovimentacaoPdf(data: MovimentacaoPdfData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const titulo = data.expedicao
    ? "Relatório de Expedição"
    : data.tipo === "saida"
      ? "Relatório de Saída de Estoque"
      : "Relatório de Entrada de Estoque";

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, pageWidth / 2, 50, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Emitido em ${formatDate(new Date().toISOString())}`, pageWidth / 2, 66, {
    align: "center",
  });

  const unidade = data.unidade ? ` ${data.unidade}` : "";
  const info: Array<[string, string]> = [
    ["Data/Hora do movimento", formatDate(data.ocorridoEm)],
    ["Tipo", data.expedicao ? "Expedição" : data.tipo === "saida" ? "Saída" : "Entrada"],
    [
      "Produto",
      data.produto
        ? `${data.produto.codigo ? `${data.produto.codigo} — ` : ""}${data.produto.nome ?? ""}`
        : "—",
    ],
    [
      "Tanque de origem",
      data.tanqueOrigem
        ? `${data.tanqueOrigem.codigo ?? ""}${data.tanqueOrigem.nome ? ` — ${data.tanqueOrigem.nome}` : ""}`
        : "—",
    ],
    ["Quantidade", `${formatNumber(data.quantidade)}${unidade}`],
    ["Origem", data.origem ?? "—"],
    ["Destino / Cliente", data.destino ?? "—"],
    ["Responsável", data.responsavel ?? "—"],
  ];

  autoTable(doc, {
    startY: 90,
    head: [["Campo", "Valor"]],
    body: info,
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 180 } },
  });

  const afterInfoY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Análises de qualidade do produto", 40, afterInfoY);

  if (!data.analises || data.analises.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Nenhuma análise de qualidade registrada para este tanque.", 40, afterInfoY + 18);
  } else {
    autoTable(doc, {
      startY: afterInfoY + 8,
      head: [["Data", "Análise", "Resultado", "Faixa", "Status", "Observação"]],
      body: data.analises.map((a) => {
        const min = a.valor_min != null ? Number(a.valor_min) : null;
        const max = a.valor_max != null ? Number(a.valor_max) : null;
        const v = Number(a.resultado);
        let status = "—";
        if (min != null || max != null) {
          status = (min != null && v < min) || (max != null && v > max) ? "Fora" : "Ok";
        }
        return [
          formatDate(a.registrado_em),
          a.nome,
          `${formatNumber(v)}${a.unidade ? ` ${a.unidade}` : ""}`,
          min != null || max != null ? `${min ?? "—"} ↔ ${max ?? "—"}` : "—",
          status,
          a.observacao ?? "",
        ];
      }),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  const filename = `${data.expedicao ? "expedicao" : data.tipo}_${Date.now()}.pdf`;
  doc.save(filename);
}
