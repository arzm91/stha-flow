import { supabase } from "@/integrations/supabase/client";
import type { FiltersValue, Row, SourceKey } from "./types";

function toIso(d?: string | null): string | undefined {
  return d ? new Date(d).toISOString() : undefined;
}
function endOfDayIso(d?: string | null): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt.toISOString();
}
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function diffMin(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  return Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 60000) * 100) / 100;
}

const MAX_ROWS = 5000;

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function fetchRows(source: SourceKey, filters: FiltersValue): Promise<Row[]> {
  const dateFrom = toIso(filters.data_de);
  const dateTo = endOfDayIso(filters.data_ate);

  switch (source) {
    case "producao.etapas": {
      let q: any = supabase
        .from("ordem_etapas")
        .select(
          "id, iniciado_em, finalizado_em, duracao_seg, processo_nome, tipo, valor_capturado, unidade, ordens_producao:ordens_producao!ordem_etapas_ordem_id_fkey(numero, status, inicio_em, fim_em, qtd_planejada, qtd_produzida, produto_id, equipamento_id, produtos:produto_id(nome, codigo), equipamentos:equipamento_id(nome, codigo))",
        )
        .order("iniciado_em", { ascending: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("iniciado_em", dateFrom);
      if (dateTo) q = q.lte("iniciado_em", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      let rows: Row[] = (data ?? []).map((r: any) => {
        const op = r.ordens_producao ?? {};
        return {
          id: r.id,
          op_numero: op.numero ?? "",
          produto: op.produtos?.nome ?? "",
          equipamento: op.equipamentos?.nome ?? "",
          op_status: op.status ?? "",
          op_inicio_em: op.inicio_em,
          op_fim_em: op.fim_em,
          op_qtd_planejada: num(op.qtd_planejada),
          op_qtd_produzida: num(op.qtd_produzida),
          processo_nome: r.processo_nome,
          tipo: r.tipo ?? "",
          iniciado_em: r.iniciado_em,
          finalizado_em: r.finalizado_em,
          duracao_seg: num(r.duracao_seg),
          valor_capturado: num(r.valor_capturado),
          unidade: r.unidade ?? "",
          _produto_id: op.produto_id,
          _equipamento_id: op.equipamento_id,
        };
      });
      if (filters.equipamento_id) rows = rows.filter((r) => r._equipamento_id === filters.equipamento_id);
      if (filters.produto_id) rows = rows.filter((r) => r._produto_id === filters.produto_id);
      if (filters.status) rows = rows.filter((r) => r.op_status === filters.status);
      if (filters.tipo) rows = rows.filter((r) => r.tipo === filters.tipo);
      return rows;
    }

    case "producao.ordens": {
      let q: any = supabase
        .from("ordens_producao")
        .select(
          "id, numero, status, prioridade, inicio_previsto, inicio_em, fim_em, duracao_estimada_min, qtd_planejada, qtd_produzida, produto_id, equipamento_id, produtos:produto_id(nome), equipamentos:equipamento_id(nome)",
        )
        .order("inicio_em", { ascending: false, nullsFirst: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("inicio_em", dateFrom);
      if (dateTo) q = q.lte("inicio_em", dateTo);
      if (filters.equipamento_id) q = q.eq("equipamento_id", filters.equipamento_id);
      if (filters.produto_id) q = q.eq("produto_id", filters.produto_id);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.prioridade) q = q.eq("prioridade", filters.prioridade);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const duracao_min = diffMin(r.inicio_em, r.fim_em);
        const plan = num(r.qtd_planejada) ?? 0;
        const prod = num(r.qtd_produzida) ?? 0;
        return {
          id: r.id,
          numero: r.numero,
          produto: r.produtos?.nome ?? "",
          equipamento: r.equipamentos?.nome ?? "",
          status: r.status,
          prioridade: r.prioridade,
          inicio_previsto: r.inicio_previsto,
          inicio_em: r.inicio_em,
          fim_em: r.fim_em,
          duracao_min,
          duracao_estimada_min: num(r.duracao_estimada_min),
          qtd_planejada: plan,
          qtd_produzida: prod,
          aderencia_pct: plan > 0 ? Math.round((prod / plan) * 10000) / 100 : null,
        };
      });
    }

    case "producao.analises": {
      let q: any = supabase
        .from("analises_registradas")
        .select(
          "id, resultado, registrado_em, analise_id, ordem_id, analises_cadastro:analise_id(nome, unidade, valor_min, valor_max), ordens_producao:ordem_id(numero, produto_id, equipamento_id, produtos:produto_id(nome), equipamentos:equipamento_id(nome))",
        )
        .order("registrado_em", { ascending: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("registrado_em", dateFrom);
      if (dateTo) q = q.lte("registrado_em", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      let rows: Row[] = (data ?? []).map((r: any) => {
        const a = r.analises_cadastro ?? {};
        const op = r.ordens_producao ?? {};
        const resultado = num(r.resultado);
        const min = num(a.valor_min);
        const max = num(a.valor_max);
        const dentro = resultado == null ? "" :
          (min != null && resultado < min) || (max != null && resultado > max) ? "Fora" : "Sim";
        return {
          id: r.id,
          op_numero: op.numero ?? "",
          produto: op.produtos?.nome ?? "",
          equipamento: op.equipamentos?.nome ?? "",
          analise: a.nome ?? "",
          resultado,
          unidade: a.unidade ?? "",
          valor_min: min,
          valor_max: max,
          dentro_spec: dentro,
          registrado_em: r.registrado_em,
          _produto_id: op.produto_id,
          _equipamento_id: op.equipamento_id,
        };
      });
      if (filters.equipamento_id) rows = rows.filter((r) => r._equipamento_id === filters.equipamento_id);
      if (filters.produto_id) rows = rows.filter((r) => r._produto_id === filters.produto_id);
      return rows;
    }

    case "estoque.movimentacoes": {
      let q: any = supabase
        .from("movimentacoes_estoque")
        .select(
          "id, ocorrido_em, tipo, quantidade, origem, destino, produto_id, tanque_id, ordem_id, produtos:produto_id(nome, unidade), tanques:tanque_id(nome), ordens_producao:ordem_id(numero)",
        )
        .order("ocorrido_em", { ascending: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("ocorrido_em", dateFrom);
      if (dateTo) q = q.lte("ocorrido_em", dateTo);
      if (filters.produto_id) q = q.eq("produto_id", filters.produto_id);
      if (filters.tipo) q = q.eq("tipo", filters.tipo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        ocorrido_em: r.ocorrido_em,
        tipo: r.tipo,
        produto: r.produtos?.nome ?? "",
        tanque: r.tanques?.nome ?? "",
        quantidade: num(r.quantidade),
        unidade: r.produtos?.unidade ?? "",
        origem: r.origem ?? "",
        destino: r.destino ?? "",
        op_numero: r.ordens_producao?.numero ?? "",
      }));
    }

    case "estoque.tanques_analises": {
      let q: any = supabase
        .from("tanque_analises")
        .select(
          "id, registrado_em, resultado, observacao, tanque_id, analise_id, tanques:tanque_id(nome, produto_id, produtos:produto_id(nome)), analises_cadastro:analise_id(nome, unidade, valor_min, valor_max)",
        )
        .order("registrado_em", { ascending: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("registrado_em", dateFrom);
      if (dateTo) q = q.lte("registrado_em", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const a = r.analises_cadastro ?? {};
        const t = r.tanques ?? {};
        const resultado = num(r.resultado);
        const min = num(a.valor_min);
        const max = num(a.valor_max);
        const dentro = resultado == null ? "" :
          (min != null && resultado < min) || (max != null && resultado > max) ? "Fora" : "Sim";
        return {
          id: r.id,
          registrado_em: r.registrado_em,
          tanque: t.nome ?? "",
          produto: t.produtos?.nome ?? "",
          analise: a.nome ?? "",
          resultado,
          unidade: a.unidade ?? "",
          valor_min: min,
          valor_max: max,
          dentro_spec: dentro,
          observacao: r.observacao ?? "",
        };
      });
    }

    case "manutencao.ordens": {
      let q: any = supabase
        .from("ordens_manutencao")
        .select(
          "id, numero, tipo, status, prioridade, responsavel, data_abertura, data_inicio, data_conclusao, custo, descricao_problema, descricao_servico, equipamento_id, equipamentos:equipamento_id(nome)",
        )
        .order("data_abertura", { ascending: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("data_abertura", dateFrom);
      if (dateTo) q = q.lte("data_abertura", dateTo);
      if (filters.equipamento_id) q = q.eq("equipamento_id", filters.equipamento_id);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.tipo) q = q.eq("tipo", filters.tipo);
      if (filters.prioridade) q = q.eq("prioridade", filters.prioridade);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        numero: r.numero,
        equipamento: r.equipamentos?.nome ?? "",
        tipo: r.tipo,
        status: r.status,
        prioridade: r.prioridade,
        responsavel: r.responsavel ?? "",
        data_abertura: r.data_abertura,
        data_inicio: r.data_inicio,
        data_conclusao: r.data_conclusao,
        duracao_min: diffMin(r.data_inicio, r.data_conclusao),
        custo: num(r.custo),
        descricao_problema: r.descricao_problema ?? "",
        descricao_servico: r.descricao_servico ?? "",
      }));
    }

    case "manutencao.preventivas": {
      let q: any = supabase
        .from("manutencao_preventivas")
        .select(
          "id, nome, ativo, tipo_recorrencia, intervalo_dias, responsavel_padrao, ultima_execucao, proxima_execucao, equipamento_id, equipamentos:equipamento_id(nome)",
        )
        .order("proxima_execucao", { ascending: true, nullsFirst: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("proxima_execucao", dateFrom);
      if (dateTo) q = q.lte("proxima_execucao", dateTo);
      if (filters.equipamento_id) q = q.eq("equipamento_id", filters.equipamento_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        nome: r.nome,
        equipamento: r.equipamentos?.nome ?? "",
        ativo: r.ativo ? "Sim" : "Não",
        tipo_recorrencia: r.tipo_recorrencia,
        intervalo_dias: num(r.intervalo_dias),
        responsavel_padrao: r.responsavel_padrao ?? "",
        ultima_execucao: r.ultima_execucao,
        proxima_execucao: r.proxima_execucao,
      }));
    }

    case "automacao.alertas": {
      let q: any = supabase
        .from("alertas_disparos")
        .select("id, created_at, alerta_nome, categoria, severidade, status, mensagem, resolvido_em")
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("created_at", dateFrom);
      if (dateTo) q = q.lte("created_at", dateTo);
      if (filters.status) q = q.eq("status", filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    }

    case "automacao.runs": {
      let q: any = supabase
        .from("automation_runs")
        .select(
          "id, trigger_fired_at, status, executed_at, error_message, flow_id, automation_flows:flow_id(nome)",
        )
        .order("trigger_fired_at", { ascending: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("trigger_fired_at", dateFrom);
      if (dateTo) q = q.lte("trigger_fired_at", dateTo);
      if (filters.status) q = q.eq("status", filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        trigger_fired_at: r.trigger_fired_at,
        flow: r.automation_flows?.nome ?? "",
        status: r.status,
        executed_at: r.executed_at,
        error_message: r.error_message ?? "",
      }));
    }
  }
}

/* Filter option loaders */
export async function loadEquipamentos() {
  const { data } = await supabase.from("equipamentos").select("id, nome, codigo").order("nome");
  return data ?? [];
}
export async function loadProdutos() {
  const { data } = await supabase.from("produtos").select("id, nome, codigo").order("nome");
  return data ?? [];
}
