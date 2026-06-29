import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatNumber, durationBetween } from "@/lib/format";

function fmtDur(seg: number | null | undefined) {
  if (seg == null) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

export async function gerarRelatorioProducaoPdf(ordemId: string) {
  // Buscar todos os dados em paralelo
  const [opRes, paramsRes, anlRes, obsRes, etapasRes, movsRes, tagHistRes] = await Promise.all([
    supabase.from("ordens_producao")
      .select("*, produto:produto_id(nome,codigo,unidade), equipamento:equipamento_id(nome,codigo), tanque:tanque_destino_id(nome,codigo)")
      .eq("id", ordemId).maybeSingle(),
    supabase.from("parametros_registrados")
      .select("*, parametro:parametro_id(nome,unidade,valor_min,valor_max)")
      .eq("ordem_id", ordemId).order("registrado_em", { ascending: true }),
    supabase.from("analises_registradas")
      .select("*, analise:analise_id(nome,unidade,valor_min,valor_max)")
      .eq("ordem_id", ordemId).order("registrado_em", { ascending: true }),
    supabase.from("observacoes_producao")
      .select("*").eq("ordem_id", ordemId).order("registrado_em", { ascending: true }),
    supabase.from("ordem_etapas")
      .select("*").eq("ordem_id", ordemId).order("iniciado_em", { ascending: true }),
    supabase.from("movimentacoes_estoque")
      .select("*, tanque:tanque_id(codigo,nome)").eq("ordem_id", ordemId).order("ocorrido_em", { ascending: true }),
    supabase.from("producao_tag_historico")
      .select("tag_nome,valor_num,unidade,registrado_em")
      .eq("ordem_id", ordemId).order("registrado_em", { ascending: true }),
  ]);

  const op: any = opRes.data;
  if (!op) throw new Error("Ordem não encontrada");
  const parametros = paramsRes.data ?? [];
  const analises = anlRes.data ?? [];
  const observacoes = obsRes.data ?? [];
  const etapas = etapasRes.data ?? [];
  const movs = movsRes.data ?? [];

  // Operador
  let operador = "—";
  if (op.owner_id) {
    const { data: prof } = await supabase.from("profiles").select("nome,email").eq("id", op.owner_id).maybeSingle();
    operador = prof?.nome || prof?.email || "—";
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const unidade = op.produto?.unidade ? ` ${op.produto.unidade}` : "";

  // Cabeçalho
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(`Raio-X da Produção — OP ${op.numero}`, W / 2, 40, { align: "center" });
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Emitido em ${formatDate(new Date().toISOString())}`, W / 2, 56, { align: "center" });

  // Resumo
  const planejada = Number(op.qtd_planejada) || 0;
  const produzida = Number(op.qtd_produzida) || 0;
  const eficiencia = planejada > 0 ? (produzida / planejada) * 100 : 0;
  const duracao = op.fim_em ? durationBetween(op.inicio_em, op.fim_em) : "Em andamento";
  const desvio = planejada > 0 ? produzida - planejada : 0;

  autoTable(doc, {
    startY: 75,
    head: [["Campo", "Valor"]],
    body: [
      ["Produto", `${op.produto?.codigo ?? ""} — ${op.produto?.nome ?? "—"}`],
      ["Equipamento", `${op.equipamento?.codigo ?? ""} — ${op.equipamento?.nome ?? "—"}`],
      ["Operador", operador],
      ["Status", op.status === "finalizada" ? "Finalizada" : "Em andamento"],
      ["Início", formatDate(op.inicio_em)],
      ["Fim", op.fim_em ? formatDate(op.fim_em) : "—"],
      ["Duração total", duracao],
      ["Qtd. planejada", `${formatNumber(planejada)}${unidade}`],
      ["Qtd. produzida", `${formatNumber(produzida)}${unidade}`],
      ["Desvio", `${desvio >= 0 ? "+" : ""}${formatNumber(desvio)}${unidade}`],
      ["Eficiência", `${eficiencia.toFixed(1)}%`],
      ["Tanque de destino", op.tanque ? `${op.tanque.codigo ?? ""} — ${op.tanque.nome ?? ""}` : "—"],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 160 } },
  });

  // Observações
  if (op.obs_iniciais || op.obs_finais) {
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Observações da OP", 40, lastY(doc) + 22);
    autoTable(doc, {
      startY: lastY(doc) + 28,
      head: [["Momento", "Texto"]],
      body: [
        ...(op.obs_iniciais ? [["Iniciais", op.obs_iniciais]] : []),
        ...(op.obs_finais ? [["Finais", op.obs_finais]] : []),
      ] as string[][],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 80 } },
    });
  }

  // Processos / Etapas
  doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("Processos e etapas", 40, lastY(doc) + 22);
  if (etapas.length === 0) {
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Nenhuma etapa registrada.", 40, lastY(doc) + 38);
  } else {
    autoTable(doc, {
      startY: lastY(doc) + 28,
      head: [["#", "Processo", "Atividade", "Início", "Fim", "Duração", "Resultado"]],
      body: etapas.map((e: any, i: number) => [
        String(i + 1),
        e.processo_nome ?? "—",
        e.atividade_descricao ?? "—",
        formatDate(e.iniciado_em),
        e.finalizado_em ? formatDate(e.finalizado_em) : "—",
        fmtDur(e.duracao_seg),
        e.valor_medido != null ? `${formatNumber(Number(e.valor_medido))}${e.unidade ? " " + e.unidade : ""}` : (e.resultado ?? "—"),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  // Parâmetros
  doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("Parâmetros registrados", 40, lastY(doc) + 22);
  if (parametros.length === 0) {
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Nenhum parâmetro registrado.", 40, lastY(doc) + 38);
  } else {
    autoTable(doc, {
      startY: lastY(doc) + 28,
      head: [["Data/Hora", "Parâmetro", "Valor", "Faixa", "Status"]],
      body: parametros.map((p: any) => {
        const min = p.parametro?.valor_min != null ? Number(p.parametro.valor_min) : null;
        const max = p.parametro?.valor_max != null ? Number(p.parametro.valor_max) : null;
        const v = Number(p.valor);
        let status = "—";
        if (min != null || max != null) {
          status = (min != null && v < min) || (max != null && v > max) ? "Fora" : "Ok";
        }
        return [
          formatDate(p.registrado_em),
          p.parametro?.nome ?? "—",
          `${formatNumber(v)}${p.parametro?.unidade ? " " + p.parametro.unidade : ""}`,
          (min != null || max != null) ? `${min ?? "—"} ↔ ${max ?? "—"}` : "—",
          status,
        ];
      }),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  // Análises
  doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("Análises de qualidade", 40, lastY(doc) + 22);
  if (analises.length === 0) {
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Nenhuma análise registrada.", 40, lastY(doc) + 38);
  } else {
    autoTable(doc, {
      startY: lastY(doc) + 28,
      head: [["Data/Hora", "Análise", "Resultado", "Faixa", "Status"]],
      body: analises.map((a: any) => {
        const min = a.analise?.valor_min != null ? Number(a.analise.valor_min) : null;
        const max = a.analise?.valor_max != null ? Number(a.analise.valor_max) : null;
        const v = Number(a.resultado);
        let status = "—";
        if (min != null || max != null) {
          status = (min != null && v < min) || (max != null && v > max) ? "Fora" : "Ok";
        }
        return [
          formatDate(a.registrado_em),
          a.analise?.nome ?? "—",
          `${formatNumber(v)}${a.analise?.unidade ? " " + a.analise.unidade : ""}`,
          (min != null || max != null) ? `${min ?? "—"} ↔ ${max ?? "—"}` : "—",
          status,
        ];
      }),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  // Desvios (parâmetros + análises fora de faixa)
  const desvios: Array<[string, string, string, string]> = [];
  for (const p of parametros as any[]) {
    const min = p.parametro?.valor_min != null ? Number(p.parametro.valor_min) : null;
    const max = p.parametro?.valor_max != null ? Number(p.parametro.valor_max) : null;
    const v = Number(p.valor);
    if ((min != null && v < min) || (max != null && v > max)) {
      desvios.push([formatDate(p.registrado_em), `Parâmetro: ${p.parametro?.nome ?? ""}`, `${formatNumber(v)}${p.parametro?.unidade ? " " + p.parametro.unidade : ""}`, `${min ?? "—"} ↔ ${max ?? "—"}`]);
    }
  }
  for (const a of analises as any[]) {
    const min = a.analise?.valor_min != null ? Number(a.analise.valor_min) : null;
    const max = a.analise?.valor_max != null ? Number(a.analise.valor_max) : null;
    const v = Number(a.resultado);
    if ((min != null && v < min) || (max != null && v > max)) {
      desvios.push([formatDate(a.registrado_em), `Análise: ${a.analise?.nome ?? ""}`, `${formatNumber(v)}${a.analise?.unidade ? " " + a.analise.unidade : ""}`, `${min ?? "—"} ↔ ${max ?? "—"}`]);
    }
  }

  doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("Desvios detectados", 40, lastY(doc) + 22);
  if (desvios.length === 0) {
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Nenhum desvio identificado.", 40, lastY(doc) + 38);
  } else {
    autoTable(doc, {
      startY: lastY(doc) + 28,
      head: [["Data/Hora", "Item", "Valor", "Faixa"]],
      body: desvios,
      styles: { fontSize: 8, cellPadding: 4, textColor: [153, 27, 27] },
      headStyles: { fillColor: [127, 29, 29], textColor: [255, 255, 255] },
    });
  }

  // Observações timeline
  if (observacoes.length > 0) {
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Observações ao longo da produção", 40, lastY(doc) + 22);
    autoTable(doc, {
      startY: lastY(doc) + 28,
      head: [["Data/Hora", "Observação"]],
      body: (observacoes as any[]).map((o) => [formatDate(o.registrado_em), o.texto ?? ""]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 0: { cellWidth: 110 } },
    });
  }

  // Movimentações de estoque
  if (movs.length > 0) {
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Movimentações de estoque", 40, lastY(doc) + 22);
    autoTable(doc, {
      startY: lastY(doc) + 28,
      head: [["Data/Hora", "Tipo", "Tanque", "Quantidade", "Origem/Destino"]],
      body: (movs as any[]).map((m) => [
        formatDate(m.ocorrido_em),
        m.tipo === "entrada" ? "Entrada" : "Saída",
        m.tanque ? `${m.tanque.codigo ?? ""} — ${m.tanque.nome ?? ""}` : "—",
        `${formatNumber(Number(m.quantidade))}${unidade}`,
        m.origem ?? m.destino ?? "—",
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  // Histórico unificado (timeline completa)
  type Evt = { when: string; tipo: string; titulo: string; detalhe: string };
  const eventos: Evt[] = [];
  eventos.push({ when: op.inicio_em, tipo: "OP", titulo: "Início da OP", detalhe: `Planejado ${formatNumber(planejada)}${unidade}` });
  for (const e of etapas as any[]) {
    const nome = e.atividade_descricao ? `${e.processo_nome} · ${e.atividade_descricao}` : e.processo_nome;
    eventos.push({ when: e.iniciado_em, tipo: "Processo", titulo: `Início: ${nome}`, detalhe: "" });
    if (e.finalizado_em) {
      eventos.push({ when: e.finalizado_em, tipo: "Processo", titulo: `Fim: ${nome}`, detalhe: fmtDur(e.duracao_seg) });
    }
  }
  for (const p of parametros as any[]) {
    eventos.push({ when: p.registrado_em, tipo: "Parâmetro", titulo: p.parametro?.nome ?? "Parâmetro", detalhe: `${formatNumber(Number(p.valor))}${p.parametro?.unidade ? " " + p.parametro.unidade : ""}` });
  }
  for (const a of analises as any[]) {
    eventos.push({ when: a.registrado_em, tipo: "Análise", titulo: a.analise?.nome ?? "Análise", detalhe: `${formatNumber(Number(a.resultado))}${a.analise?.unidade ? " " + a.analise.unidade : ""}` });
  }
  for (const o of observacoes as any[]) {
    eventos.push({ when: o.registrado_em, tipo: "Observação", titulo: "Observação", detalhe: o.texto ?? "" });
  }
  for (const m of movs as any[]) {
    eventos.push({ when: m.ocorrido_em, tipo: "Estoque", titulo: m.tipo === "entrada" ? "Entrada estoque" : "Saída estoque", detalhe: `${formatNumber(Number(m.quantidade))}${unidade} · ${m.tanque ? (m.tanque.codigo ?? "") + " " + (m.tanque.nome ?? "") : ""}` });
  }
  if (op.fim_em) eventos.push({ when: op.fim_em, tipo: "OP", titulo: "Fim da OP", detalhe: `Produzido ${formatNumber(produzida)}${unidade}` });
  eventos.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());

  doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("Histórico completo (timeline)", 40, lastY(doc) + 22);
  autoTable(doc, {
    startY: lastY(doc) + 28,
    head: [["Data/Hora", "Tipo", "Evento", "Detalhe"]],
    body: eventos.map((e) => [formatDate(e.when), e.tipo, e.titulo, e.detalhe]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 70 } },
  });

  // Rodapé com numeração
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`OP ${op.numero} · página ${i} de ${pages}`, W / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
  }

  doc.save(`raio-x_OP_${op.numero}_${Date.now()}.pdf`);
}
