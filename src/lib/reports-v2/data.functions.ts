import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- helpers ----------
function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

// ============================================================
// 1) ESTOQUE TOTAL
// ============================================================
export const fetchEstoqueTotal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const sinceEntradas = hoursAgo(24 * 30);

    const [{ data: produtos }, { data: movs30 }, { data: movs24h }] = await Promise.all([
      supabase.from("produtos").select("id, codigo, nome, unidade, categoria, ativo").eq("ativo", true).order("nome"),
      supabase.from("movimentacoes_estoque").select("produto_id, tipo, quantidade, ocorrido_em").gte("ocorrido_em", sinceEntradas),
      supabase.from("movimentacoes_estoque").select("produto_id, tipo, quantidade").gte("ocorrido_em", hoursAgo(24)),
    ]);

    // TODO: usar todos os movimentos históricos para saldo real; aqui simplificamos com últimos 30d
    const saldoPorProduto = new Map<string, { entradas: number; saidas: number; saldo: number; ent24: number; sai24: number }>();
    for (const p of produtos ?? []) saldoPorProduto.set(p.id, { entradas: 0, saidas: 0, saldo: 0, ent24: 0, sai24: 0 });

    for (const m of movs30 ?? []) {
      const s = saldoPorProduto.get(m.produto_id);
      if (!s) continue;
      const q = Number(m.quantidade || 0);
      if (m.tipo === "entrada" || m.tipo === "producao") { s.entradas += q; s.saldo += q; }
      else if (m.tipo === "saida" || m.tipo === "consumo") { s.saidas += q; s.saldo -= q; }
    }
    for (const m of movs24h ?? []) {
      const s = saldoPorProduto.get(m.produto_id);
      if (!s) continue;
      const q = Number(m.quantidade || 0);
      if (m.tipo === "entrada" || m.tipo === "producao") s.ent24 += q;
      else if (m.tipo === "saida" || m.tipo === "consumo") s.sai24 += q;
    }

    const linhas = (produtos ?? []).map((p) => {
      const s = saldoPorProduto.get(p.id)!;
      const consumoDiario = s.saidas / 30;
      const diasCobertura = consumoDiario > 0 ? s.saldo / consumoDiario : null;
      const projetado7d = s.saldo - consumoDiario * 7;
      return {
        id: p.id,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        categoria: p.categoria,
        entradas30d: s.entradas,
        saidas30d: s.saidas,
        saldoAtual: s.saldo,
        ent24: s.ent24,
        sai24: s.sai24,
        consumoDiario,
        diasCobertura,
        projetado7d,
      };
    });

    const totalProdutos = linhas.length;
    const totalEntradas30d = linhas.reduce((a, l) => a + l.entradas30d, 0);
    const totalSaidas30d = linhas.reduce((a, l) => a + l.saidas30d, 0);
    const criticos = linhas.filter((l) => l.diasCobertura !== null && l.diasCobertura < 7).length;

    return { linhas, kpis: { totalProdutos, totalEntradas30d, totalSaidas30d, criticos, ent24: linhas.reduce((a, l) => a + l.ent24, 0), sai24: linhas.reduce((a, l) => a + l.sai24, 0) } };
  });

// ============================================================
// 2) PRODUTIVIDADE TOTAL (todos equipamentos)
// ============================================================
export const fetchProdutividadeTotal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const inicioMes = startOfMonth();

    const [{ data: equips }, { data: ordens }, { data: produtos }, { data: movs }] = await Promise.all([
      supabase.from("equipamentos").select("id, codigo, nome, tipo, status, categoria").eq("ativo", true).order("nome"),
      supabase.from("ordens_producao").select("id, numero, status, equipamento_id, produto_id, qtd_planejada, qtd_produzida, inicio_em, fim_em").gte("created_at", inicioMes).order("fim_em", { ascending: false, nullsFirst: false }),
      supabase.from("produtos").select("id, nome, unidade").eq("ativo", true),
      supabase.from("movimentacoes_estoque").select("produto_id, tipo, quantidade").gte("ocorrido_em", hoursAgo(24 * 60)),
    ]);

    const prodMap = new Map((produtos ?? []).map((p) => [p.id, p]));
    const equipRows = (equips ?? []).map((e) => {
      const ordensEquip = (ordens ?? []).filter((o) => o.equipamento_id === e.id);
      const ultima = ordensEquip[0];
      const totalMes = ordensEquip.reduce((a, o) => a + Number(o.qtd_produzida || 0), 0);
      const finalizadasMes = ordensEquip.filter((o) => o.status === "finalizada").length;
      return {
        id: e.id,
        codigo: e.codigo,
        nome: e.nome,
        tipo: e.tipo,
        status: e.status,
        ultima: ultima ? {
          numero: ultima.numero,
          status: ultima.status,
          produto: prodMap.get(ultima.produto_id!)?.nome ?? "—",
          unidade: prodMap.get(ultima.produto_id!)?.unidade ?? "",
          qtd: Number(ultima.qtd_produzida || 0),
          planejada: Number(ultima.qtd_planejada || 0),
          fim: ultima.fim_em,
          inicio: ultima.inicio_em,
        } : null,
        totalMes,
        finalizadasMes,
        emAndamentoMes: ordensEquip.filter((o) => o.status === "em_andamento").length,
      };
    });

    // Estoque resumido
    const saldoMap = new Map<string, number>();
    for (const m of movs ?? []) {
      const q = Number(m.quantidade || 0);
      const cur = saldoMap.get(m.produto_id) ?? 0;
      if (m.tipo === "entrada" || m.tipo === "producao") saldoMap.set(m.produto_id, cur + q);
      else saldoMap.set(m.produto_id, cur - q);
    }
    const estoque = (produtos ?? []).map((p) => ({ nome: p.nome, unidade: p.unidade, saldo: saldoMap.get(p.id) ?? 0 })).filter((p) => p.saldo !== 0).sort((a, b) => b.saldo - a.saldo).slice(0, 30);

    const kpis = {
      totalEquip: equipRows.length,
      producaoMes: equipRows.reduce((a, e) => a + e.totalMes, 0),
      ordensMes: (ordens ?? []).length,
      finalizadasMes: (ordens ?? []).filter((o) => o.status === "finalizada").length,
      emAndamento: equipRows.reduce((a, e) => a + e.emAndamentoMes, 0),
    };

    return { equipamentos: equipRows, estoque, kpis };
  });

// ============================================================
// 3) PRODUTIVIDADE POR EQUIPAMENTO
// ============================================================
export const fetchProdutividadeEquip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { equipamentoId: string; ordemId?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const inicioMes = startOfMonth();

    const { data: equip } = await supabase.from("equipamentos").select("id, codigo, nome, tipo, status, categoria, localizacao").eq("id", data.equipamentoId).maybeSingle();
    if (!equip) throw new Error("Equipamento não encontrado");

    const { data: ordens } = await supabase
      .from("ordens_producao")
      .select("id, numero, status, produto_id, qtd_planejada, qtd_produzida, inicio_em, fim_em, obs_iniciais, obs_finais, tanque_destino_id")
      .eq("equipamento_id", data.equipamentoId)
      .gte("created_at", inicioMes)
      .order("fim_em", { ascending: false, nullsFirst: false });

    // Última = a passada como ordemId, ou a mais recente finalizada, ou a mais recente
    let ultima = null as any;
    if (data.ordemId) ultima = (ordens ?? []).find((o) => o.id === data.ordemId) ?? null;
    if (!ultima) ultima = (ordens ?? []).find((o) => o.status === "finalizada") ?? (ordens ?? [])[0] ?? null;

    let materiais: any[] = [];
    let produtoUltima: any = null;
    if (ultima) {
      const [{ data: mats }, { data: prod }] = await Promise.all([
        supabase.from("ordem_materiais").select("materia_prima_id, quantidade_prevista, quantidade_consumida, percentual").eq("ordem_id", ultima.id),
        supabase.from("produtos").select("id, codigo, nome, unidade").eq("id", ultima.produto_id).maybeSingle(),
      ]);
      produtoUltima = prod;
      const ids = (mats ?? []).map((m) => m.materia_prima_id).filter(Boolean);
      const { data: mps } = ids.length ? await supabase.from("produtos").select("id, codigo, nome, unidade").in("id", ids) : { data: [] as any[] };
      const mpMap = new Map((mps ?? []).map((p) => [p.id, p]));
      materiais = (mats ?? []).map((m) => ({
        nome: mpMap.get(m.materia_prima_id)?.nome ?? "—",
        codigo: mpMap.get(m.materia_prima_id)?.codigo ?? "",
        unidade: mpMap.get(m.materia_prima_id)?.unidade ?? "",
        prevista: Number(m.quantidade_prevista || 0),
        consumida: Number(m.quantidade_consumida || 0),
        percentual: Number(m.percentual || 0),
      }));
    }

    // Tabela de produções do mês
    const produtoIds = Array.from(new Set((ordens ?? []).map((o) => o.produto_id).filter(Boolean))) as string[];
    const { data: prods } = produtoIds.length ? await supabase.from("produtos").select("id, nome, unidade").in("id", produtoIds) : { data: [] as any[] };
    const pMap = new Map((prods ?? []).map((p) => [p.id, p]));
    const historico = (ordens ?? []).map((o) => ({
      id: o.id,
      numero: o.numero,
      status: o.status,
      produto: pMap.get(o.produto_id!)?.nome ?? "—",
      unidade: pMap.get(o.produto_id!)?.unidade ?? "",
      planejada: Number(o.qtd_planejada || 0),
      produzida: Number(o.qtd_produzida || 0),
      inicio: o.inicio_em,
      fim: o.fim_em,
    }));

    const kpis = {
      totalMes: historico.reduce((a, h) => a + h.produzida, 0),
      ordensMes: historico.length,
      finalizadasMes: historico.filter((h) => h.status === "finalizada").length,
      eficienciaUltima: ultima && ultima.qtd_planejada ? (Number(ultima.qtd_produzida || 0) / Number(ultima.qtd_planejada) * 100) : null,
    };

    return { equip, ultima: ultima ? { ...ultima, produto: produtoUltima } : null, materiais, historico, kpis };
  });

// ============================================================
// 4) MENSAL CONSOLIDADO
// ============================================================
export const fetchMensal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { equipamentoId?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const inicioMes = startOfMonth();

    let q = supabase.from("ordens_producao")
      .select("id, numero, status, equipamento_id, produto_id, qtd_planejada, qtd_produzida, inicio_em, fim_em")
      .gte("created_at", inicioMes)
      .order("inicio_em", { ascending: false, nullsFirst: false });
    if (data.equipamentoId) q = q.eq("equipamento_id", data.equipamentoId);
    const { data: ordens } = await q;

    const [{ data: equips }, { data: produtos }] = await Promise.all([
      supabase.from("equipamentos").select("id, codigo, nome").eq("ativo", true),
      supabase.from("produtos").select("id, nome, unidade").eq("ativo", true),
    ]);
    const eMap = new Map((equips ?? []).map((e) => [e.id, e]));
    const pMap = new Map((produtos ?? []).map((p) => [p.id, p]));

    const porEquip: Record<string, { equip: any; totalMes: number; ordens: any[]; finalizadas: number }> = {};
    for (const o of ordens ?? []) {
      const key = o.equipamento_id || "sem";
      if (!porEquip[key]) porEquip[key] = { equip: eMap.get(o.equipamento_id!) ?? { nome: "Sem equipamento", codigo: "" }, totalMes: 0, ordens: [], finalizadas: 0 };
      porEquip[key].totalMes += Number(o.qtd_produzida || 0);
      porEquip[key].ordens.push({
        numero: o.numero,
        status: o.status,
        produto: pMap.get(o.produto_id!)?.nome ?? "—",
        unidade: pMap.get(o.produto_id!)?.unidade ?? "",
        planejada: Number(o.qtd_planejada || 0),
        produzida: Number(o.qtd_produzida || 0),
        inicio: o.inicio_em,
        fim: o.fim_em,
      });
      if (o.status === "finalizada") porEquip[key].finalizadas += 1;
    }

    const kpis = {
      totalOrdens: (ordens ?? []).length,
      totalProduzido: (ordens ?? []).reduce((a, o) => a + Number(o.qtd_produzida || 0), 0),
      totalPlanejado: (ordens ?? []).reduce((a, o) => a + Number(o.qtd_planejada || 0), 0),
      finalizadas: (ordens ?? []).filter((o) => o.status === "finalizada").length,
      emAndamento: (ordens ?? []).filter((o) => o.status === "em_andamento").length,
    };

    return { grupos: Object.values(porEquip), kpis, equipamentos: equips ?? [] };
  });

// ============================================================
// 5) MANUTENÇÃO 24h + PROGRAMADAS
// ============================================================
export const fetchManutencao24h = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = hoursAgo(24);
    const now = new Date().toISOString();

    const [{ data: realizadas }, { data: programadas }, { data: equips }] = await Promise.all([
      supabase.from("ordens_manutencao")
        .select("id, numero, tipo, prioridade, status, equipamento_id, responsavel, descricao_problema, data_conclusao, data_inicio, data_abertura, custo")
        .gte("data_conclusao", since)
        .order("data_conclusao", { ascending: false }),
      supabase.from("ordens_manutencao")
        .select("id, numero, tipo, prioridade, status, equipamento_id, responsavel, descricao_problema, agendada_para, data_abertura")
        .in("status", ["aberta", "programada", "em_andamento"])
        .gte("agendada_para", now)
        .order("agendada_para", { ascending: true })
        .limit(50),
      supabase.from("equipamentos").select("id, codigo, nome"),
    ]);
    const eMap = new Map((equips ?? []).map((e) => [e.id, e]));

    const mapRow = (o: any) => ({ ...o, equipamento: eMap.get(o.equipamento_id)?.nome ?? "—" });

    const kpis = {
      realizadas24h: (realizadas ?? []).length,
      programadas: (programadas ?? []).length,
      custoTotal24h: (realizadas ?? []).reduce((a, o) => a + Number(o.custo || 0), 0),
      criticas: (programadas ?? []).filter((o) => o.prioridade === "alta" || o.prioridade === "critica").length,
    };

    return { realizadas: (realizadas ?? []).map(mapRow), programadas: (programadas ?? []).map(mapRow), kpis };
  });

// ============================================================
// 6) ORDEM DE SERVIÇO DE MANUTENÇÃO (uma)
// ============================================================
export const fetchOsManutencao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: os } = await supabase.from("ordens_manutencao").select("*").eq("id", data.id).maybeSingle();
    if (!os) throw new Error("OS não encontrada");
    const [{ data: equip }, { data: atividades }] = await Promise.all([
      supabase.from("equipamentos").select("codigo, nome, tipo, localizacao").eq("id", os.equipamento_id).maybeSingle(),
      supabase.from("manutencao_atividades").select("descricao, realizada, observacao, ordem_seq").eq("ordem_id", os.id).order("ordem_seq"),
    ]);
    return { os, equipamento: equip, atividades: atividades ?? [] };
  });

export const listOsManutencao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ordens_manutencao").select("id, numero, status, tipo, prioridade, data_abertura, agendada_para, equipamento_id").order("data_abertura", { ascending: false }).limit(100);
    return data ?? [];
  });

// ============================================================
// 7) ORDEM DE PRODUÇÃO (uma)
// ============================================================
export const fetchOrdemProducao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: op } = await supabase.from("ordens_producao").select("*").eq("id", data.id).maybeSingle();
    if (!op) throw new Error("Ordem não encontrada");
    const [{ data: equip }, { data: produto }, { data: mats }, { data: etapas }] = await Promise.all([
      op.equipamento_id ? supabase.from("equipamentos").select("codigo, nome, tipo").eq("id", op.equipamento_id).maybeSingle() : Promise.resolve({ data: null as any }),
      op.produto_id ? supabase.from("produtos").select("codigo, nome, unidade").eq("id", op.produto_id).maybeSingle() : Promise.resolve({ data: null as any }),
      supabase.from("ordem_materiais").select("materia_prima_id, percentual, quantidade_prevista, quantidade_consumida, tanque_id").eq("ordem_id", op.id),
      supabase.from("ordem_etapas").select("nome, ordem_seq, status, inicio_em, fim_em").eq("ordem_id", op.id).order("ordem_seq"),
    ]);
    const ids = (mats ?? []).map((m) => m.materia_prima_id).filter(Boolean);
    const { data: mps } = ids.length ? await supabase.from("produtos").select("id, codigo, nome, unidade").in("id", ids) : { data: [] as any[] };
    const mpMap = new Map((mps ?? []).map((p) => [p.id, p]));
    const materiais = (mats ?? []).map((m) => ({
      nome: mpMap.get(m.materia_prima_id)?.nome ?? "—",
      codigo: mpMap.get(m.materia_prima_id)?.codigo ?? "",
      unidade: mpMap.get(m.materia_prima_id)?.unidade ?? "",
      percentual: Number(m.percentual || 0),
      prevista: Number(m.quantidade_prevista || 0),
      consumida: Number(m.quantidade_consumida || 0),
    }));
    return { op, equipamento: equip, produto, materiais, etapas: etapas ?? [] };
  });

export const listOrdensProducao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ordens_producao").select("id, numero, status, equipamento_id, produto_id, inicio_em, fim_em, created_at").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

// ============================================================
// 8) ALERTAS 24h
// ============================================================
export const fetchAlertas24h = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = hoursAgo(24);
    const { data: disparos } = await supabase.from("alertas_disparos")
      .select("id, alerta_nome, severidade, mensagem, contexto, status, resolvido_em, categoria, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    const total = (disparos ?? []).length;
    const criticos = (disparos ?? []).filter((d) => d.severidade === "critical" || d.severidade === "high").length;
    const resolvidos = (disparos ?? []).filter((d) => d.status === "resolvido" || d.resolvido_em).length;
    const abertos = total - resolvidos;

    // Agrupamento por severidade
    const porSeveridade: Record<string, number> = {};
    for (const d of disparos ?? []) porSeveridade[d.severidade || "info"] = (porSeveridade[d.severidade || "info"] || 0) + 1;
    // Por alerta (top causas)
    const porAlerta: Record<string, number> = {};
    for (const d of disparos ?? []) porAlerta[d.alerta_nome || "—"] = (porAlerta[d.alerta_nome || "—"] || 0) + 1;
    const topCausas = Object.entries(porAlerta).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 10);

    return { disparos: disparos ?? [], kpis: { total, criticos, resolvidos, abertos }, porSeveridade, topCausas };
  });

// Trigger util para o dialog "Última produção finalizada?"
export const fetchLastFinishedByEquip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { equipamentoId: string }) => z.object({ equipamentoId: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: o } = await context.supabase.from("ordens_producao")
      .select("id, numero").eq("equipamento_id", data.equipamentoId).eq("status", "finalizada")
      .order("fim_em", { ascending: false }).limit(1).maybeSingle();
    return o;
  });
