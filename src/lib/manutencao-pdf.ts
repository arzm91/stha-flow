import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

type OrdemRow = {
  numero: string;
  tipo: string;
  prioridade: string;
  status: string;
  responsavel: string | null;
  descricao_problema: string | null;
  descricao_servico: string | null;
  pecas_utilizadas: string | null;
  custo: number | null;
  observacoes: string | null;
  data_abertura: string;
  data_inicio: string | null;
  data_conclusao: string | null;
  agendada_para: string | null;
  equipamento: { codigo: string; nome: string } | null;
};

export async function gerarOSManutencaoPdf(ordemId: string) {
  const [osRes, atRes] = await Promise.all([
    supabase
      .from("ordens_manutencao")
      .select("*, equipamento:equipamento_id(codigo,nome)")
      .eq("id", ordemId)
      .maybeSingle(),
    supabase
      .from("manutencao_atividades")
      .select("*")
      .eq("ordem_id", ordemId)
      .order("ordem_seq", { ascending: true }),
  ]);

  const os = osRes.data as OrdemRow | null;
  if (!os) throw new Error("OS não encontrada");
  const atividades = atRes.data ?? [];

  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Ordem de Serviço de Manutenção`, pageW / 2, 18, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Nº ${os.numero} · ${os.tipo.toUpperCase()}`, pageW / 2, 26, { align: "center" });

  autoTable(doc, {
    startY: 34,
    theme: "grid",
    styles: { fontSize: 9 },
    head: [["Campo", "Valor"]],
    body: [
      ["Equipamento", os.equipamento ? `${os.equipamento.codigo} — ${os.equipamento.nome}` : "—"],
      ["Tipo", os.tipo],
      ["Prioridade", os.prioridade],
      ["Status", os.status],
      ["Responsável", os.responsavel ?? "—"],
      ["Abertura", formatDate(os.data_abertura)],
      ["Agendada para", os.agendada_para ? formatDate(os.agendada_para) : "—"],
      ["Início", os.data_inicio ? formatDate(os.data_inicio) : "—"],
      ["Conclusão", os.data_conclusao ? formatDate(os.data_conclusao) : "—"],
      ["Custo", os.custo != null ? `R$ ${Number(os.custo).toFixed(2)}` : "—"],
    ],
  });

  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  function section(title: string, text: string | null | undefined) {
    if (!text) return;
    const y = lastY() + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(text, pageW - 28);
    doc.text(lines, 14, y + 6);
    // simulate finalY
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY = y + 6 + lines.length * 4;
  }

  section("Descrição do Problema", os.descricao_problema);
  section("Serviço Realizado", os.descricao_servico);
  section("Peças Utilizadas", os.pecas_utilizadas);
  section("Observações", os.observacoes);

  // Checklist
  if (atividades.length > 0) {
    autoTable(doc, {
      startY: lastY() + 8,
      theme: "striped",
      styles: { fontSize: 9 },
      head: [["#", "Atividade", "Realizada", "Observação"]],
      body: atividades.map((a, i) => [
        String(i + 1),
        a.descricao,
        a.realizada ? "✓" : "□",
        a.observacao ?? "",
      ]),
    });
  }

  // Footer signatures
  const sigY = Math.min(lastY() + 25, doc.internal.pageSize.getHeight() - 30);
  doc.setFontSize(9);
  doc.line(20, sigY, 90, sigY);
  doc.text("Executante", 55, sigY + 5, { align: "center" });
  doc.line(pageW - 90, sigY, pageW - 20, sigY);
  doc.text("Supervisor", pageW - 55, sigY + 5, { align: "center" });

  doc.save(`OS_${os.tipo}_${os.numero}.pdf`);
}
