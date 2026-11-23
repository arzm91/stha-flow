// Server-side PDF generation for scheduled report automations.
// Builds the PDF with jsPDF (no DOM), uploads to the private "relatorios-pdf"
// bucket and returns a signed download URL for the e-mail.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type TipoRelatorio = "producao" | "manutencao" | "alertas";
export const TITULOS: Record<TipoRelatorio, string> = {
  producao: "Relatório de produção",
  manutencao: "Relatório de manutenção",
  alertas: "Relatório de alertas",
};

const TZ = "America/Sao_Paulo";
const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "—");
const n = (v: unknown, d = 2) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const dur = (seg: number) => { const m = Math.round(seg / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}min`; };

type Resumo = Array<[string, string]>;

async function dados(sb: any, owner: string, tipo: TipoRelatorio, ini: string, fim: string) {
  if (tipo === "producao") {
    const { data: ops } = await sb.from("ordens_producao")
      .select("numero,qtd_produzida,inicio_em,fim_em,indice_conversao,responsavel_fechamento,produto:produto_id(nome),equipamento:equipamento_id(codigo),materiais:ordem_materiais(quantidade_consumida)")
      .eq("owner_id", owner).eq("status", "finalizada").gte("fim_em", ini).lte("fim_em", fim).order("fim_em").limit(1000);
    const { data: par } = await sb.from("paradas_equipamento").select("inicio_em,fim_em,duracao_seg,motivo,equipamento:equipamento_id(codigo)")
      .eq("owner_id", owner).gte("inicio_em", ini).lte("inicio_em", fim).order("inicio_em").limit(1000);
    const rows = ops ?? [];
    const prod = rows.reduce((s: number, o: any) => s + Number(o.qtd_produzida ?? 0), 0);
    const cons = rows.reduce((s: number, o: any) => s + (o.materiais ?? []).reduce((a: number, m: any) => a + Number(m.quantidade_consumida ?? 0), 0), 0);
    const tParado = (par ?? []).reduce((s: number, p: any) => s + Number(p.duracao_seg ?? 0), 0);
    const resumo: Resumo = [["Ordens", String(rows.length)], ["Produzido", n(prod)], ["Consumido", n(cons)], ["Paradas", `${(par ?? []).length} (${dur(tParado)})`]];
    return {
      resumo,
      tabelas: [
        { titulo: "Produções do período", head: ["OP", "Equip.", "Produto", "Início", "Fim", "Produzido", "Índice", "Responsável"],
          body: rows.map((o: any) => [o.numero, o.equipamento?.codigo ?? "—", o.produto?.nome ?? "—", dt(o.inicio_em), dt(o.fim_em), n(o.qtd_produzida), n(o.indice_conversao, 3), o.responsavel_fechamento ?? "—"]) },
        { titulo: "Paradas", head: ["Equip.", "Início", "Fim", "Duração", "Motivo"],
          body: (par ?? []).map((p: any) => [p.equipamento?.codigo ?? "—", dt(p.inicio_em), dt(p.fim_em), p.duracao_seg ? dur(p.duracao_seg) : "em aberto", p.motivo ?? "—"]) },
      ],
    };
  }
  if (tipo === "manutencao") {
    const { data } = await sb.from("ordens_manutencao")
      .select("numero,tipo,prioridade,status,data_abertura,data_conclusao,responsavel,descricao_problema,custo,equipamento:equipamento_id(codigo)")
      .eq("owner_id", owner).gte("data_abertura", ini).lte("data_abertura", fim).order("data_abertura").limit(1000);
    const rows = data ?? [];
    const concl = rows.filter((r: any) => r.status === "concluida").length;
    const custo = rows.reduce((s: number, r: any) => s + Number(r.custo ?? 0), 0);
    return {
      resumo: [["Ordens abertas", String(rows.length)], ["Concluídas", String(concl)], ["Pendentes", String(rows.length - concl)], ["Custo", `R$ ${n(custo)}`]] as Resumo,
      tabelas: [{ titulo: "Ordens de manutenção", head: ["Nº", "Equip.", "Tipo", "Prioridade", "Status", "Abertura", "Conclusão", "Responsável", "Problema"],
        body: rows.map((r: any) => [r.numero, r.equipamento?.codigo ?? "—", r.tipo, r.prioridade, r.status, dt(r.data_abertura), dt(r.data_conclusao), r.responsavel ?? "—", r.descricao_problema ?? "—"]) }],
    };
  }
  const { data } = await sb.from("alertas_disparos").select("alerta_nome,severidade,status,created_at,resolvido_em")
    .eq("owner_id", owner).gte("created_at", ini).lte("created_at", fim).order("created_at").limit(2000);
  const rows = data ?? [];
  const crit = rows.filter((r: any) => ["critical", "critico"].includes(r.severidade)).length;
  const ativos = rows.filter((r: any) => !r.resolvido_em).length;
  return {
    resumo: [["Total", String(rows.length)], ["Críticos", String(crit)], ["Atenção", String(rows.length - crit)], ["Ainda ativos", String(ativos)]] as Resumo,
    tabelas: [{ titulo: "Ocorrências", head: ["Início", "Alerta", "Nível", "Fim", "Duração"],
      body: rows.map((r: any) => [dt(r.created_at), r.alerta_nome ?? "—", ["critical", "critico"].includes(r.severidade) ? "Crítico" : "Atenção", r.resolvido_em ? dt(r.resolvido_em) : "ativo",
        r.resolvido_em ? dur((new Date(r.resolvido_em).getTime() - new Date(r.created_at).getTime()) / 1000) : "—"]) }],
  };
}

export async function gerarRelatorioPdf(sb: any, owner: string, tipo: TipoRelatorio, inicio: Date, fim: Date) {
  const ini = inicio.toISOString(), fimIso = fim.toISOString();
  const { resumo, tabelas } = await dados(sb, owner, tipo, ini, fimIso);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const periodo = `${dt(ini)} a ${dt(fimIso)}`;
  doc.setFillColor(15, 61, 94); doc.rect(0, 0, W, 22, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(TITULOS[tipo], 12, 11); doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Período: ${periodo}  ·  Emitido em ${dt(new Date().toISOString())}  ·  STHApc`, 12, 17);
  doc.setTextColor(30, 30, 30);
  const bw = (W - 24 - 3 * 4) / 4;
  resumo.forEach(([l, v], i) => {
    const x = 12 + i * (bw + 4);
    doc.setDrawColor(210); doc.roundedRect(x, 27, bw, 16, 2, 2);
    doc.setFontSize(8); doc.setTextColor(110); doc.text(l, x + 3, 32);
    doc.setFontSize(13); doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.text(v, x + 3, 40); doc.setFont("helvetica", "normal");
  });
  let y = 50;
  for (const t of tabelas) {
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text(t.titulo, 12, y); doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 2, head: [t.head], body: t.body.length ? t.body : [[{ content: "Nenhum registro no período.", colSpan: t.head.length }]],
      styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [15, 61, 94] }, alternateRowStyles: { fillColor: [244, 247, 250] }, margin: { left: 12, right: 12 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(130); doc.text(`Página ${i} de ${pages}`, W - 30, doc.internal.pageSize.getHeight() - 5); }
  const bytes = new Uint8Array(doc.output("arraybuffer"));

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = `${owner}/${tipo}-${fimIso.replace(/[:.]/g, "-")}.pdf`;
  const up = await supabaseAdmin.storage.from("relatorios-pdf").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error("falha ao salvar PDF: " + up.error.message);
  const sig = await supabaseAdmin.storage.from("relatorios-pdf").createSignedUrl(path, 60 * 60 * 24 * 7);
  if (sig.error || !sig.data) throw new Error("falha ao gerar link do PDF");
  return { url: sig.data.signedUrl, periodo, resumo, titulo: TITULOS[tipo] };
}
