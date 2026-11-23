import { indiceCorrigido } from "@/lib/reports-v2/producao-periodo";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatNumber, durationBetween } from "@/lib/format";
import { calcularIndice, parseIndices } from "@/lib/indices/calc";
import type { SheetColumn } from "@/lib/tabelas/types";

type RGB = [number, number, number];
const DARK: RGB = [15, 23, 42];
const ACCENT: RGB = [37, 99, 235];
const MUTED: RGB = [100, 116, 139];
const RED: RGB = [185, 28, 28];
const GREEN: RGB = [21, 128, 61];

function fmtDur(seg: number | null | undefined) {
  if (seg == null || !Number.isFinite(seg)) return "—";
  seg = Math.max(0, Math.round(seg));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;
const setY = (doc: jsPDF, y: number) => { (doc as any).lastAutoTable = { finalY: y }; };
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Relatório de fechamento da produção. Todos os dados são filtrados entre o início e o fim da OP. */
export type PeriodoEquip = { equipamentoId: string; inicio: string; fim: string };

/** Relatório de fechamento da produção (por OP) ou do equipamento num período livre (sem OP). */
export async function gerarRelatorioProducaoPdf(alvo: string | PeriodoEquip) {
  const porPeriodo = typeof alvo !== "string";
  let ordemId = typeof alvo === "string" ? alvo : "";
  let op: any;
  let opIds: string[] = [];
  if (!porPeriodo) {
    const r = await supabase.from("ordens_producao")
      .select("*, produto:produto_id(nome,codigo,unidade,concentracao), equipamento:equipamento_id(id,nome,codigo,tag_velocidade_producao,tag_velocidade_consumo,indices_config,capacidade_hora,capacidade_unidade), tanque:tanque_destino_id(nome,codigo)")
      .eq("id", ordemId).maybeSingle() as { data: any };
    op = r.data;
    if (!op) throw new Error("Ordem não encontrada");
    opIds = [ordemId];
  } else {
    const { data: eq } = await supabase.from("equipamentos")
      .select("id,nome,codigo,tag_producao_total,tag_velocidade_producao,tag_velocidade_consumo,indices_config,capacidade_hora,capacidade_unidade")
      .eq("id", alvo.equipamentoId).maybeSingle() as { data: any };
    if (!eq) throw new Error("Equipamento não encontrado");
    const { data: ops } = await supabase.from("ordens_producao").select("id")
      .eq("equipamento_id", eq.id).lte("inicio_em", alvo.fim).or(`fim_em.is.null,fim_em.gte.${alvo.inicio}`);
    opIds = (ops ?? []).map((o) => o.id);
    const { data: prods } = await supabase.from("produtos").select("nome,codigo,unidade,concentracao").eq("equipamento_id", eq.id).limit(1);
    let qtd = 0;
    if (eq.tag_producao_total) {
      const { data: h } = await supabase.from("producao_tag_historico").select("valor_num")
        .eq("equipamento_id", eq.id).eq("tag_nome", eq.tag_producao_total)
        .gte("registrado_em", alvo.inicio).lte("registrado_em", alvo.fim).order("registrado_em").limit(10000);
      const vals = (h ?? []).map((r) => Number(r.valor_num ?? 0));
      for (let i = 1; i < vals.length; i++) { const d = vals[i]! - vals[i - 1]!; qtd += d >= 0 ? d : vals[i]!; }
    }
    op = {
      numero: `${eq.codigo ?? eq.nome} (período)`, equipamento: eq, produto: prods?.[0] ?? null,
      inicio_em: alvo.inicio, fim_em: alvo.fim, qtd_produzida: qtd, finalizado_por: null, responsavel_fechamento: null,
      tanque: null, obs_iniciais: null, obs_finais: null, concentracao_media: null, indice_conversao: null,
    };
    ordemId = "";
  }
  if (!op.inicio_em) throw new Error("Produção sem data de início");
  const fOrd = porPeriodo ? "id.not.is.null" : `ordem_id.eq.${ordemId}`;
  const fOps = opIds.length ? `ordem_id.in.(${opIds.join(",")})` : "id.is.null";
  const ini = op.inicio_em as string;
  const fim = (op.fim_em as string | null) ?? new Date().toISOString();
  const equip = op.equipamento ?? {};
  const un = op.produto?.unidade ? ` ${op.produto.unidade}` : "";

  const [paramsRes, anlRes, obsRes, etapasRes, matsRes, tagHistRes, paradasRes, trocasRes, sheetsRes] = await Promise.all([
    supabase.from("parametros_registrados").select("*, parametro:parametro_id(nome,unidade,valor_min,valor_max)")
      .or(fOrd).gte("registrado_em", ini).lte("registrado_em", fim).order("registrado_em"),
    supabase.from("analises_registradas").select("*, analise:analise_id(nome,unidade,valor_min,valor_max)")
      .or(fOrd).gte("registrado_em", ini).lte("registrado_em", fim).order("registrado_em"),
    supabase.from("observacoes_producao").select("*").or(fOrd).gte("registrado_em", ini).lte("registrado_em", fim).order("registrado_em"),
    supabase.from("ordem_etapas").select("*").or(fOrd).gte("iniciado_em", ini).lte("iniciado_em", fim).order("iniciado_em"),
    supabase.from("ordem_materiais").select("quantidade_prevista,quantidade_consumida,percentual,mp:materia_prima_id(nome,unidade)").or(fOps),
    supabase.from("producao_tag_historico").select("tag_nome,valor_num,unidade,registrado_em")
      .or(porPeriodo ? `equipamento_id.eq.${equip.id}` : fOrd).gte("registrado_em", ini).lte("registrado_em", fim).order("registrado_em").limit(10000),
    equip.id
      ? supabase.from("paradas_equipamento").select("inicio_em,fim_em,duracao_seg,motivo,categoria,observacao")
          .eq("equipamento_id", equip.id).lte("inicio_em", fim).or(`fim_em.is.null,fim_em.gte.${ini}`).order("inicio_em")
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("ordem_trocas_produto").select("ocorrido_em,qtd_produto_anterior,observacao,anterior:produto_anterior_id(nome),novo:produto_novo_id(nome)")
      .or(fOps).order("ocorrido_em"),
    equip.id
      ? supabase.from("custom_sheets").select("id,nome,columns,tabela_analise").contains("equipamento_ids", [equip.id] as never).order("nome")
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const parametros = (paramsRes.data ?? []) as any[];
  const analises = (anlRes.data ?? []) as any[];
  const observacoes = (obsRes.data ?? []) as any[];
  const etapas = (etapasRes.data ?? []) as any[];
  const mats = (matsRes.data ?? []) as any[];
  const tagHist = (tagHistRes.data ?? []) as { tag_nome: string; valor_num: number | null; unidade: string | null; registrado_em: string }[];
  const paradas = (paradasRes.data ?? []) as any[];
  const trocas = (trocasRes.data ?? []) as any[];
  const sheets = (sheetsRes.data ?? []) as any[];
  let sheetRows: any[] = [];
  if (sheets.length) {
    const { data } = await supabase.from("custom_sheet_rows").select("sheet_id,data,created_at,created_by")
      .in("sheet_id", sheets.map((s) => s.id)).gte("created_at", ini).lte("created_at", fim).order("created_at");
    sheetRows = data ?? [];
  }

  // Pessoas
  let loginFinal = "—";
  if (op.finalizado_por) {
    const { data: prof } = await supabase.from("profiles").select("nome,email").eq("id", op.finalizado_por).maybeSingle();
    loginFinal = prof?.email ? `${prof.nome ? prof.nome + " · " : ""}${prof.email}` : (prof?.nome ?? "—");
  }

  // Tempos / OEE (disponibilidade)
  const tIni = new Date(ini).getTime(), tFim = new Date(fim).getTime();
  const tTotal = Math.max(0, (tFim - tIni) / 1000);
  const paradasRows = paradas.map((p) => {
    const a = Math.max(tIni, new Date(p.inicio_em).getTime());
    const b = Math.min(tFim, p.fim_em ? new Date(p.fim_em).getTime() : tFim);
    return { ...p, dur: Math.max(0, (b - a) / 1000) };
  });
  const tParado = Math.min(tTotal, paradasRows.reduce((s, p) => s + p.dur, 0));
  const tOper = tTotal - tParado;
  const disp = tTotal > 0 ? (tOper / tTotal) * 100 : null;

  // Produção / consumo
  const produzida = Number(op.qtd_produzida ?? 0);
  const consumoTotal = mats.reduce((s, m) => s + Number(m.quantidade_consumida ?? 0), 0);
  const concMedia = op.concentracao_media != null ? Number(op.concentracao_media) : null;
  const concCad = op.produto?.concentracao != null ? Number(op.produto.concentracao) : null;
  const conversao = op.indice_conversao != null ? Number(op.indice_conversao) : indiceCorrigido(consumoTotal, produzida, concCad, concMedia);

  // Tags no período
  const byTag = new Map<string, { unidade: string | null; values: number[] }>();
  for (const r of tagHist) {
    if (r.valor_num == null) continue;
    const cur = byTag.get(r.tag_nome) ?? { unidade: r.unidade, values: [] };
    cur.values.push(Number(r.valor_num));
    byTag.set(r.tag_nome, cur);
  }
  const lastVal = (n: string) => { const v = byTag.get(n)?.values; return v && v.length ? v[v.length - 1] : null; };
  const horasOper = tOper / 3600;
  const velProdTag = equip.tag_velocidade_producao ? avg(byTag.get(equip.tag_velocidade_producao)?.values ?? []) : null;
  const velConsTag = equip.tag_velocidade_consumo ? avg(byTag.get(equip.tag_velocidade_consumo)?.values ?? []) : null;
  const velProd = velProdTag ?? (horasOper > 0 ? produzida / horasOper : null);
  const velCons = velConsTag ?? (horasOper > 0 && consumoTotal > 0 ? consumoTotal / horasOper : null);
  const velUn = equip.capacidade_unidade || op.produto?.unidade || "";

  // Índices cadastrados (corrigidos pela concentração)
  const concProd = op.produto?.concentracao != null ? Number(op.produto.concentracao) : null;
  const indices = parseIndices(equip.indices_config).filter((c) => c.tag || c.formula);
  const indicesRows = indices.map((c) => {
    const v = calcularIndice(c, lastVal, concProd);
    const vals = c.tag ? byTag.get(c.tag)?.values ?? [] : [];
    const mediaBase = avg(vals);
    const vMed = mediaBase != null ? calcularIndice(c, (n) => (n === c.tag ? mediaBase : lastVal(n)), concProd) : null;
    const f = (x: number | null) => (x == null ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: c.decimais, maximumFractionDigits: c.decimais }));
    return [c.nome || c.tag, c.formula || "direto", f(vMed), f(v), c.unidade || ""];
  });

  // ================= PDF =================
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;

  doc.setFillColor(...DARK); doc.rect(0, 0, W, 78, "F");
  doc.setFillColor(...ACCENT); doc.rect(0, 78, W, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(17);
  doc.text("Relatório de Fechamento da Produção", M, 34);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`OP ${op.numero} · ${op.produto?.nome ?? "—"} · ${equip.nome ?? "—"}`, M, 52);
  doc.setFontSize(8);
  doc.text(`Período: ${formatDate(ini)} → ${formatDate(fim)}`, M, 66);
  doc.text(`Emitido em ${formatDate(new Date().toISOString())}`, W - M, 66, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // KPI cards
  const kpis: Array<[string, string, RGB?]> = [
    ["Produzido", `${formatNumber(produzida)}${un}`],
    ["Consumo MP", consumoTotal > 0 ? formatNumber(consumoTotal) : "—"],
    ["Duração", durationBetween(ini, fim)],
    ["Tempo parado", fmtDur(tParado), tParado > 0 ? RED : GREEN],
    ["Disponibilidade", disp != null ? `${disp.toFixed(1)}%` : "—", disp != null && disp < 85 ? RED : GREEN],
  ];
  const cw = (W - 2 * M - 4 * 8) / 5;
  kpis.forEach(([l, v, c], i) => {
    const x = M + i * (cw + 8), y = 96;
    doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252); doc.roundedRect(x, y, cw, 48, 4, 4, "FD");
    doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(l.toUpperCase(), x + 8, y + 15);
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...(c ?? DARK)); doc.text(v, x + 8, y + 36);
    doc.setFont("helvetica", "normal");
  });
  doc.setTextColor(0, 0, 0);
  setY(doc, 150);

  const section = (title: string) => {
    let y = lastY(doc) + 22;
    if (y > H - 90) { doc.addPage(); y = 50; }
    doc.setFillColor(...ACCENT); doc.rect(M, y - 9, 3, 12, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...DARK);
    doc.text(title, M + 8, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);
    setY(doc, y + 4);
  };
  const empty = (txt: string) => {
    doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(txt, M + 8, lastY(doc) + 14); doc.setTextColor(0, 0, 0);
    setY(doc, lastY(doc) + 18);
  };
  const table = (head: string[], body: (string | number)[][], extra: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: lastY(doc) + 6, head: [head], body: body as any,
      margin: { left: M, right: M },
      styles: { fontSize: 8, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      ...extra,
    });
  };

  section("Identificação e rastreabilidade");
  table(["Campo", "Valor"], [
    ["Produto", `${op.produto?.codigo ?? ""} — ${op.produto?.nome ?? "—"}${concProd != null ? ` (${formatNumber(concProd)}%)` : ""}`],
    ["Equipamento", `${equip.codigo ?? ""} — ${equip.nome ?? "—"}`],
    ["Início", formatDate(ini)],
    ["Finalização", op.fim_em ? formatDate(op.fim_em) : "Em andamento"],
    ["Tanque de destino", op.tanque ? `${op.tanque.codigo ?? ""} — ${op.tanque.nome ?? ""}` : "—"],
    ["Responsável pelo fechamento", op.responsavel_fechamento ?? "—"],
    ["Login que finalizou", loginFinal],
  ], { columnStyles: { 0: { fontStyle: "bold", cellWidth: 170 } } });

  section("Produção");
  const prodRows: (string)[][] = [];
  if (trocas.length > 0) {
    let acum = 0;
    for (const t of trocas) {
      const q = Number(t.qtd_produto_anterior ?? 0); acum += q;
      prodRows.push([t.anterior?.nome ?? "—", `até ${formatDate(t.ocorrido_em)}`, `${formatNumber(q)}${un}`]);
    }
    prodRows.push([op.produto?.nome ?? "—", "após última troca", `${formatNumber(Math.max(0, produzida - acum))}${un}`]);
  } else {
    prodRows.push([op.produto?.nome ?? "—", "produção inteira", `${formatNumber(produzida)}${un}`]);
  }
  prodRows.push(["Total", "", `${formatNumber(produzida)}${un}`]);
  table(["Produto", "Período", "Quantidade"], prodRows, { didParseCell: (d: any) => { if (d.section === "body" && d.row.index === prodRows.length - 1) d.cell.styles.fontStyle = "bold"; } });

  section("Consumo de matérias-primas");
  if (mats.length === 0) empty("Nenhuma matéria-prima registrada.");
  else table(["Matéria-prima", "%", "Consumido"], mats.map((m) => [
    m.mp?.nome ?? "—", m.percentual != null ? `${Number(m.percentual).toFixed(2)}%` : "—",
    m.quantidade_consumida != null ? `${formatNumber(Number(m.quantidade_consumida))} ${m.mp?.unidade ?? ""}` : "—",
  ]));

  section("Índices de conversão e velocidades médias");
  const idxBody: string[][] = [
    ["Concentração média do período", concCad != null ? `${concCad}% (cadastro)` : "—", concMedia != null ? `${concMedia}%` : "—", "—", ""],
    ["Índice de conversão (consumido ÷ produzido × conc. cad. ÷ conc. média)", "—", conversao != null ? conversao.toLocaleString("pt-BR", { maximumFractionDigits: 3, minimumFractionDigits: 3 }) : "—", "—", ""],
    ...indicesRows,
    ["Velocidade média de produção", equip.tag_velocidade_producao ?? "produzido ÷ horas operando", velProd != null ? formatNumber(velProd) : "—", "—", velProdTag != null ? "" : `${velUn}/h`],
    ["Velocidade média de consumo", equip.tag_velocidade_consumo ?? "consumido ÷ horas operando", velCons != null ? formatNumber(velCons) : "—", "—", velConsTag != null ? "" : "/h"],
  ];
  table(["Indicador", "Origem / fórmula", "Média no período", "Último", "Unid."], idxBody);

  section("Paradas e disponibilidade (OEE)");
  table(["Tempo total", "Tempo parado", "Tempo operando", "Disponibilidade", "Paradas"], [[
    fmtDur(tTotal), fmtDur(tParado), fmtDur(tOper), disp != null ? `${disp.toFixed(1)}%` : "—", String(paradasRows.length),
  ]]);
  if (paradasRows.length === 0) empty("100% operacional — nenhuma parada registrada no período.");
  else table(["Início", "Fim", "Duração", "Categoria", "Motivo / observação"], paradasRows.map((p) => [
    formatDate(p.inicio_em), p.fim_em ? formatDate(p.fim_em) : "em aberto", fmtDur(p.dur), p.categoria ?? "—", [p.motivo, p.observacao].filter(Boolean).join(" · ") || "—",
  ]), { styles: { fontSize: 8, cellPadding: 4, textColor: RED } });

  const fora = (v: number, min: number | null, max: number | null) => (min != null && v < min) || (max != null && v > max);
  const faixaStatus = (row: any, key: string, val: string) => {
    const min = row[key]?.valor_min != null ? Number(row[key].valor_min) : null;
    const max = row[key]?.valor_max != null ? Number(row[key].valor_max) : null;
    const v = Number(row[val]);
    return { min, max, v, out: fora(v, min, max), has: min != null || max != null };
  };
  const redOut = (rows: { out: boolean }[]) => ({ didParseCell: (d: any) => { if (d.section === "body" && rows[d.row.index]?.out) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = "bold"; } } });

  section("Parâmetros");
  if (parametros.length === 0) empty("Nenhum parâmetro registrado no período.");
  else {
    const st = parametros.map((p) => faixaStatus(p, "parametro", "valor"));
    table(["Data/Hora", "Parâmetro", "Valor", "Faixa", "Status"], parametros.map((p, i) => [
      formatDate(p.registrado_em), p.parametro?.nome ?? "—", `${formatNumber(st[i].v)} ${p.parametro?.unidade ?? ""}`,
      st[i].has ? `${st[i].min ?? "—"} ↔ ${st[i].max ?? "—"}` : "—", st[i].has ? (st[i].out ? "FORA" : "OK") : "—",
    ]), redOut(st));
  }

  section("Processos");
  if (etapas.length === 0) empty("Nenhum processo registrado no período.");
  else table(["Processo", "Atividade", "Início", "Fim", "Duração", "Resultado"], etapas.map((e) => [
    e.processo_nome ?? "—", e.atividade_descricao ?? "—", formatDate(e.iniciado_em), e.finalizado_em ? formatDate(e.finalizado_em) : "—",
    fmtDur(e.duracao_seg), e.valor_medido != null ? `${formatNumber(Number(e.valor_medido))} ${e.unidade ?? ""}` : (e.resultado ?? "—"),
  ]));

  section("Análises");
  if (analises.length === 0) empty("Nenhuma análise avulsa registrada no período.");
  else {
    const st = analises.map((a) => faixaStatus(a, "analise", "resultado"));
    table(["Data/Hora", "Análise", "Resultado", "Faixa", "Status"], analises.map((a, i) => [
      formatDate(a.registrado_em), a.analise?.nome ?? "—", `${formatNumber(st[i].v)} ${a.analise?.unidade ?? ""}`,
      st[i].has ? `${st[i].min ?? "—"} ↔ ${st[i].max ?? "—"}` : "—", st[i].has ? (st[i].out ? "FORA" : "OK") : "—",
    ]), redOut(st));
  }

  // Tabelas vinculadas
  for (const sh of sheets) {
    const rows = sheetRows.filter((r) => r.sheet_id === sh.id);
    if (rows.length === 0) continue;
    const cols = ((sh.columns ?? []) as SheetColumn[]).slice(0, 9);
    section(`${sh.tabela_analise ? "Análises — " : "Tabela — "}${sh.nome}`);
    table(["Registrado em", ...cols.map((c) => c.label)], rows.map((r) => [
      formatDate(r.created_at),
      ...cols.map((c) => {
        const v = (r.data ?? {})[c.key];
        if (v == null || v === "") return "—";
        if (c.type === "number") return formatNumber(Number(v));
        if (c.type === "boolean") return v ? "Sim" : "Não";
        return String(v);
      }),
    ]));
  }

  const { data: turnosData } = await supabase.from("relatorio_turno_eventos")
    .select("ocorrido_em,categoria,titulo,descricao,responsavel").gte("ocorrido_em", ini).lte("ocorrido_em", fim).order("ocorrido_em").limit(500);
  const turnos = (turnosData ?? []) as any[];
  section("Turnos");
  if (turnos.length === 0) empty("Nenhum registro de turno no período.");
  else table(["Data/Hora", "Categoria", "Registro", "Responsável"], turnos.map((t) => [
    formatDate(t.ocorrido_em), t.categoria ?? "—", [t.titulo, t.descricao].filter(Boolean).join(" — ") || "—", t.responsavel ?? "—",
  ]), { columnStyles: { 0: { cellWidth: 95 }, 1: { cellWidth: 80 } } });

  section("Observações");
  const obsBody: string[][] = [
    ...(op.obs_iniciais ? [["Iniciais", op.obs_iniciais]] : []),
    ...observacoes.map((o) => [formatDate(o.registrado_em), o.texto ?? ""]),
    ...(op.obs_finais ? [["Finais", op.obs_finais]] : []),
  ];
  if (obsBody.length === 0) empty("Nenhuma observação.");
  else table(["Momento", "Observação"], obsBody, { columnStyles: { 0: { cellWidth: 110 } } });

  // Histórico
  type Evt = { when: string; tipo: string; detalhe: string };
  const ev: Evt[] = [{ when: ini, tipo: "Início", detalhe: "Início da produção" }];
  for (const t of trocas) ev.push({ when: t.ocorrido_em, tipo: "Troca de produto", detalhe: `${t.anterior?.nome ?? "—"} → ${t.novo?.nome ?? "—"} (${formatNumber(Number(t.qtd_produto_anterior ?? 0))}${un})` });
  for (const p of paradasRows) ev.push({ when: p.inicio_em, tipo: "Parada", detalhe: `${p.motivo ?? "sem motivo"} · ${fmtDur(p.dur)}` });
  for (const e of etapas) ev.push({ when: e.iniciado_em, tipo: "Processo", detalhe: `${e.processo_nome ?? ""}${e.atividade_descricao ? " · " + e.atividade_descricao : ""}` });
  for (const p of parametros) ev.push({ when: p.registrado_em, tipo: "Parâmetro", detalhe: `${p.parametro?.nome ?? ""}: ${formatNumber(Number(p.valor))}` });
  for (const a of analises) ev.push({ when: a.registrado_em, tipo: "Análise", detalhe: `${a.analise?.nome ?? ""}: ${formatNumber(Number(a.resultado))}` });
  for (const o of observacoes) ev.push({ when: o.registrado_em, tipo: "Observação", detalhe: o.texto ?? "" });
  if (op.fim_em) ev.push({ when: op.fim_em, tipo: "Fim", detalhe: `Finalizada por ${op.responsavel_fechamento ?? "—"}` });
  ev.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
  section("Histórico");
  table(["Data/Hora", "Evento", "Detalhe"], ev.map((e) => [formatDate(e.when), e.tipo, e.detalhe]), { columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 90 } } });

  // Assinatura
  let y = lastY(doc) + 50;
  if (y > H - 60) { doc.addPage(); y = 90; }
  doc.setDrawColor(...MUTED);
  doc.line(M, y, M + 220, y); doc.line(W - M - 220, y, W - M, y);
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(`Responsável: ${op.responsavel_fechamento ?? ""}`, M, y + 12);
  doc.text("Supervisão", W - M - 220, y + 12);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(`STHApc · Fechamento OP ${op.numero}`, M, H - 18);
    doc.text(`Página ${i} de ${pages}`, W - M, H - 18, { align: "right" });
  }
  doc.save(`fechamento_OP_${op.numero}.pdf`);
}
