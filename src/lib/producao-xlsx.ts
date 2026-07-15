import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatNumber } from "@/lib/format";

function fmtDur(seg: number | null | undefined) {
  if (seg == null) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

type TagPoint = { tag_nome: string; valor_num: number | null; unidade: string | null; registrado_em: string };

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

function renderTagChartPng(
  tagHist: TagPoint[],
  inicio: string | null,
  fim: string | null,
): string | null {
  if (tagHist.length === 0) return null;
  const W = 1400, H = 700;
  const PAD = { top: 40, right: 200, bottom: 60, left: 70 };
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Agrupa por tag
  const byTag = new Map<string, TagPoint[]>();
  for (const p of tagHist) {
    if (p.valor_num == null) continue;
    if (!byTag.has(p.tag_nome)) byTag.set(p.tag_nome, []);
    byTag.get(p.tag_nome)!.push(p);
  }
  if (byTag.size === 0) return null;

  const allTs = tagHist.map((p) => new Date(p.registrado_em).getTime());
  const allVs = tagHist.filter((p) => p.valor_num != null).map((p) => Number(p.valor_num));
  const tMin = inicio ? new Date(inicio).getTime() : Math.min(...allTs);
  const tMax = fim ? new Date(fim).getTime() : Math.max(...allTs, Date.now());
  const vMin = Math.min(...allVs);
  const vMax = Math.max(...allVs);
  const vPad = (vMax - vMin) * 0.08 || 1;
  const y0 = vMin - vPad, y1 = vMax + vPad;

  const xScale = (t: number) => PAD.left + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - PAD.left - PAD.right);
  const yScale = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);

  // Fundo
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Título
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 20px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Histórico de tags da produção", PAD.left, 24);

  // Grade + eixos
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.font = "11px Arial, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.textAlign = "right";
  const ySteps = 6;
  for (let i = 0; i <= ySteps; i++) {
    const v = y0 + ((y1 - y0) * i) / ySteps;
    const y = yScale(v);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    ctx.fillText(formatNumber(v), PAD.left - 6, y + 4);
  }
  ctx.textAlign = "center";
  const xSteps = 8;
  for (let i = 0; i <= xSteps; i++) {
    const t = tMin + ((tMax - tMin) * i) / xSteps;
    const x = xScale(t);
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke();
    const d = new Date(t);
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    ctx.fillText(label, x, H - PAD.bottom + 16);
  }

  // Bordas
  ctx.strokeStyle = "#94a3b8";
  ctx.strokeRect(PAD.left, PAD.top, W - PAD.left - PAD.right, H - PAD.top - PAD.bottom);

  // Linhas
  let idx = 0;
  const legend: { nome: string; cor: string; unidade: string | null }[] = [];
  for (const [nome, pts] of byTag) {
    const cor = COLORS[idx % COLORS.length];
    legend.push({ nome, cor, unidade: pts[0]?.unidade ?? null });
    ctx.strokeStyle = cor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.sort((a, b) => new Date(a.registrado_em).getTime() - new Date(b.registrado_em).getTime());
    pts.forEach((p, i) => {
      const x = xScale(new Date(p.registrado_em).getTime());
      const y = yScale(Number(p.valor_num));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    idx++;
  }

  // Legenda
  ctx.textAlign = "left";
  ctx.font = "12px Arial, sans-serif";
  legend.forEach((l, i) => {
    const y = PAD.top + 10 + i * 20;
    ctx.fillStyle = l.cor;
    ctx.fillRect(W - PAD.right + 10, y - 8, 14, 10);
    ctx.fillStyle = "#0f172a";
    ctx.fillText(`${l.nome}${l.unidade ? ` (${l.unidade})` : ""}`, W - PAD.right + 30, y);
  });

  return canvas.toDataURL("image/png");
}

export async function gerarRelatorioProducaoXlsx(ordemId: string) {
  const [opRes, paramsRes, anlRes, obsRes, etapasRes, movsRes, tagHistRes, trocasRes] = await Promise.all([
    supabase.from("ordens_producao")
      .select("*, produto:produto_id(nome,codigo,unidade), equipamento:equipamento_id(nome,codigo)")
      .eq("id", ordemId).maybeSingle(),
    supabase.from("parametros_registrados")
      .select("*, parametro:parametro_id(nome,unidade)")
      .eq("ordem_id", ordemId).order("registrado_em", { ascending: true }),
    supabase.from("analises_registradas")
      .select("*, analise:analise_id(nome,unidade)")
      .eq("ordem_id", ordemId).order("registrado_em", { ascending: true }),
    supabase.from("observacoes_producao")
      .select("*").eq("ordem_id", ordemId).order("registrado_em", { ascending: true }),
    supabase.from("ordem_etapas")
      .select("*").eq("ordem_id", ordemId).order("iniciado_em", { ascending: true }),
    supabase.from("movimentacoes_estoque")
      .select("*, tanque:tanque_id(codigo,nome), produto:produto_id(codigo,nome)").eq("ordem_id", ordemId).order("ocorrido_em", { ascending: true }),
    supabase.from("producao_tag_historico")
      .select("tag_nome,valor_num,unidade,registrado_em")
      .eq("ordem_id", ordemId).order("registrado_em", { ascending: true }),
    supabase.from("ordem_trocas_produto")
      .select("id, ocorrido_em, qtd_produto_anterior, observacao, produto_anterior:produto_anterior_id(nome,unidade), produto_novo:produto_novo_id(nome)")
      .eq("ordem_id", ordemId).order("ocorrido_em", { ascending: true }),
  ]);

  const op: any = opRes.data;
  if (!op) throw new Error("Ordem não encontrada");
  const parametros = paramsRes.data ?? [];
  const analises = anlRes.data ?? [];
  const observacoes = obsRes.data ?? [];
  const etapas = (etapasRes.data ?? []) as any[];
  const movs = (movsRes.data ?? []) as any[];
  const tagHist = (tagHistRes.data ?? []) as TagPoint[];
  const trocas = (trocasRes.data ?? []) as any[];

  const wb = new ExcelJS.Workbook();
  wb.creator = "STHA Flow";
  wb.created = new Date();

  const headerFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

  // ============ RESUMO ============
  const s1 = wb.addWorksheet("Resumo");
  s1.columns = [{ width: 30 }, { width: 60 }];
  const resumo: [string, string][] = [
    ["OP", String(op.numero ?? "")],
    ["Produto", `${op.produto?.codigo ?? ""} — ${op.produto?.nome ?? ""}`],
    ["Equipamento", `${op.equipamento?.codigo ?? ""} — ${op.equipamento?.nome ?? ""}`],
    ["Status", String(op.status ?? "")],
    ["Início", op.inicio_em ? formatDate(op.inicio_em) : "—"],
    ["Fim", op.fim_em ? formatDate(op.fim_em) : "—"],
    ["Qtd. planejada", `${formatNumber(Number(op.qtd_planejada ?? 0))} ${op.produto?.unidade ?? ""}`],
    ["Qtd. produzida", op.qtd_produzida != null ? `${formatNumber(Number(op.qtd_produzida))} ${op.produto?.unidade ?? ""}` : "—"],
  ];
  s1.addRow(["Campo", "Valor"]);
  s1.getRow(1).eachCell((c) => { c.fill = headerFill; c.font = headerFont; });
  resumo.forEach((r) => s1.addRow(r));

  // ============ TIMELINE ============
  const s2 = wb.addWorksheet("Timeline");
  s2.columns = [
    { header: "Quando", key: "quando", width: 22 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Título", key: "titulo", width: 40 },
    { header: "Detalhe", key: "detalhe", width: 50 },
    { header: "Valor", key: "valor", width: 20 },
    { header: "Unidade", key: "unidade", width: 12 },
  ];
  s2.getRow(1).eachCell((c) => { c.fill = headerFill; c.font = headerFont; });

  type Row = { when: string; tipo: string; titulo: string; detalhe?: string; valor?: string | number; unidade?: string };
  const rows: Row[] = [];
  for (const p of parametros) {
    rows.push({
      when: p.registrado_em, tipo: "Parâmetro",
      titulo: (p.parametro as any)?.nome ?? "Parâmetro",
      valor: Number(p.valor), unidade: (p.parametro as any)?.unidade ?? "",
    });
  }
  for (const a of analises) {
    rows.push({
      when: a.registrado_em, tipo: "Análise",
      titulo: (a.analise as any)?.nome ?? "Análise",
      valor: Number(a.resultado), unidade: (a.analise as any)?.unidade ?? "",
    });
  }
  for (const o of observacoes) {
    rows.push({ when: o.registrado_em, tipo: "Observação", titulo: "Observação", detalhe: (o as any).texto });
  }
  for (const e of etapas) {
    const nome = e.atividade_descricao ? `${e.processo_nome} · ${e.atividade_descricao}` : e.processo_nome;
    rows.push({
      when: e.iniciado_em, tipo: "Início processo",
      titulo: nome ?? "Processo",
      detalhe: e.observacao ?? undefined,
      valor: e.valor_inicio != null ? Number(e.valor_inicio) : undefined,
      unidade: e.unidade ?? "",
    });
    if (e.finalizado_em) {
      const partes: string[] = [];
      if (e.duracao_seg != null) partes.push(`Duração ${fmtDur(e.duracao_seg)}`);
      if (e.valor_inicio != null || e.valor_fim != null) {
        partes.push(`Tag ${e.valor_inicio != null ? formatNumber(Number(e.valor_inicio)) : "—"} → ${e.valor_fim != null ? formatNumber(Number(e.valor_fim)) : "—"}`);
      }
      if (e.motivo_atraso) partes.push(`Motivo atraso: ${e.motivo_atraso}`);
      rows.push({
        when: e.finalizado_em, tipo: "Fim processo",
        titulo: nome ?? "Processo",
        detalhe: partes.join(" · "),
        valor: e.valor_capturado != null ? Number(e.valor_capturado)
             : e.valor_fim != null ? Number(e.valor_fim)
             : undefined,
        unidade: e.unidade ?? "",
      });
    }
  }
  for (const m of movs) {
    rows.push({
      when: m.ocorrido_em, tipo: m.tipo === "saida" ? "Consumo" : "Movimentação",
      titulo: `${(m.produto as any)?.nome ?? "Produto"}${m.tanque ? ` · ${(m.tanque as any).nome ?? ""}` : ""}`,
      detalhe: m.origem ?? "",
      valor: Number(m.quantidade),
    });
  }
  for (const t of trocas) {
    rows.push({
      when: t.ocorrido_em, tipo: "Troca de produto",
      titulo: `${t.produto_anterior?.nome ?? "—"} → ${t.produto_novo?.nome ?? "—"}`,
      detalhe: t.observacao ?? "",
      valor: Number(t.qtd_produto_anterior),
      unidade: t.produto_anterior?.unidade ?? "",
    });
  }
  rows.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
  for (const r of rows) {
    s2.addRow({
      quando: formatDate(r.when),
      tipo: r.tipo,
      titulo: r.titulo,
      detalhe: r.detalhe ?? "",
      valor: r.valor ?? "",
      unidade: r.unidade ?? "",
    });
  }

  // ============ ETAPAS (detalhado) ============
  const s3 = wb.addWorksheet("Etapas");
  s3.columns = [
    { header: "Processo", key: "processo", width: 30 },
    { header: "Atividade", key: "ativ", width: 30 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Início", key: "ini", width: 22 },
    { header: "Fim", key: "fim", width: 22 },
    { header: "Duração", key: "dur", width: 14 },
    { header: "Valor início", key: "vi", width: 16 },
    { header: "Valor fim", key: "vf", width: 16 },
    { header: "Valor capturado", key: "vc", width: 18 },
    { header: "Unidade", key: "un", width: 10 },
    { header: "Observação", key: "obs", width: 40 },
  ];
  s3.getRow(1).eachCell((c) => { c.fill = headerFill; c.font = headerFont; });
  for (const e of etapas) {
    s3.addRow({
      processo: e.processo_nome ?? "",
      ativ: e.atividade_descricao ?? "",
      tipo: e.tipo ?? "",
      ini: e.iniciado_em ? formatDate(e.iniciado_em) : "",
      fim: e.finalizado_em ? formatDate(e.finalizado_em) : "",
      dur: e.duracao_seg != null ? fmtDur(e.duracao_seg) : "",
      vi: e.valor_inicio != null ? Number(e.valor_inicio) : "",
      vf: e.valor_fim != null ? Number(e.valor_fim) : "",
      vc: e.valor_capturado != null ? Number(e.valor_capturado) : "",
      un: e.unidade ?? "",
      obs: [e.observacao, e.motivo_atraso].filter(Boolean).join(" · "),
    });
  }

  // ============ HISTÓRICO DE TAGS ============
  const s4 = wb.addWorksheet("Histórico de tags");
  s4.columns = [
    { header: "Quando", key: "quando", width: 22 },
    { header: "Tag", key: "tag", width: 30 },
    { header: "Valor", key: "valor", width: 16 },
    { header: "Unidade", key: "unidade", width: 12 },
  ];
  s4.getRow(1).eachCell((c) => { c.fill = headerFill; c.font = headerFont; });
  for (const t of tagHist) {
    s4.addRow({
      quando: formatDate(t.registrado_em),
      tag: t.tag_nome,
      valor: t.valor_num != null ? Number(t.valor_num) : "",
      unidade: t.unidade ?? "",
    });
  }

  // ============ GRÁFICO (imagem PNG) ============
  const s5 = wb.addWorksheet("Gráfico");
  s5.getCell("A1").value = `Histórico de tags — OP ${op.numero}`;
  s5.getCell("A1").font = { bold: true, size: 14 };
  const pngDataUrl = renderTagChartPng(tagHist, op.inicio_em, op.fim_em);
  if (pngDataUrl) {
    const base64 = pngDataUrl.split(",")[1];
    const imgId = wb.addImage({ base64, extension: "png" });
    s5.addImage(imgId, { tl: { col: 0, row: 2 }, ext: { width: 1200, height: 600 } });
  } else {
    s5.getCell("A3").value = "Sem histórico de tags para esta ordem.";
  }

  // Download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `producao-op-${op.numero ?? ordemId}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
