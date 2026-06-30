import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const destinoSchema = z.object({
  tanque_id: z.string().uuid(),
  quantidade: z.number().positive(),
});
const analiseSchema = z.object({
  analise_id: z.string().uuid(),
  resultado: z.number(),
});
const approvalPayloadSchema = z
  .object({
    destinos: z.array(destinoSchema).optional(),
    analises: z.array(analiseSchema).optional(),
  })
  .optional();

const idSchema = z.object({
  runId: z.string().uuid(),
  payload: approvalPayloadSchema,
});

type ApprovalPayload = z.infer<typeof approvalPayloadSchema>;

type GraphNode = {
  id: string;
  type: "trigger" | "condition" | "action";
  data?: { label?: string; config?: Record<string, unknown> };
};
type GraphEdge = { id?: string; source: string; target: string };
type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

type ActionResult = {
  node: string;
  kind: string;
  action: string;
  ok: boolean;
  error?: string;
  info?: string;
  skipped?: boolean;
};

function parseGraph(raw: unknown): Graph {
  // Backward-compat: planned_actions used to be just an array of nodes.
  if (Array.isArray(raw)) return { nodes: raw as GraphNode[], edges: [] };
  const obj = (raw ?? {}) as { nodes?: GraphNode[]; edges?: GraphEdge[] };
  return { nodes: obj.nodes ?? [], edges: obj.edges ?? [] };
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case "gt": return a > b;
    case "lt": return a < b;
    case "gte": return a >= b;
    case "lte": return a <= b;
    case "eq": return a === b;
    case "neq": return a !== b;
    default: return false;
  }
}

async function evaluateCondition(
  supabase: any,
  ownerId: string,
  cfg: Record<string, unknown>,
): Promise<{ ok: boolean; reason?: string }> {
  const type = String(cfg.type ?? "");
  if (type === "equipamento_status") {
    const equipId = cfg.equipamento_id as string;
    const esperado = String(cfg.status ?? "ocupado");
    if (!equipId) return { ok: false, reason: "equipamento não informado" };
    const { data } = await supabase
      .from("equipamentos").select("status").eq("id", equipId).maybeSingle();
    if (!data) return { ok: false, reason: "equipamento não encontrado" };
    return { ok: data.status === esperado, reason: `status atual ${data.status}` };
  }
  if (type === "tag_comparacao") {
    const tagNome = cfg.tag_nome as string;
    const operador = String(cfg.operador ?? "gt");
    const valor = Number(cfg.valor ?? 0);
    if (!tagNome) return { ok: false, reason: "tag não informada" };
    const { data } = await supabase
      .from("tags_live").select("valor_num")
      .eq("owner_id", ownerId).eq("nome", tagNome).maybeSingle();
    const v = data?.valor_num != null ? Number(data.valor_num) : null;
    if (v == null) return { ok: false, reason: "tag sem valor" };
    return { ok: compare(v, operador, valor), reason: `tag=${v}` };
  }
  if (type === "existe_ordem_programada") {
    const equipId = cfg.equipamento_id as string;
    if (!equipId) return { ok: false, reason: "equipamento não informado" };
    const { count } = await supabase
      .from("ordens_producao")
      .select("id", { count: "exact", head: true })
      .eq("equipamento_id", equipId).eq("status", "programada");
    return { ok: (count ?? 0) > 0, reason: `${count ?? 0} programadas` };
  }
  if (type === "janela_horario") {
    const inicio = String(cfg.inicio ?? "00:00");
    const fim = String(cfg.fim ?? "23:59");
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const ok = inicio <= fim
      ? hhmm >= inicio && hhmm <= fim
      : hhmm >= inicio || hhmm <= fim;
    return { ok, reason: `hora ${hhmm}` };
  }
  return { ok: true };
}

async function runActionNode(
  supabase: any,
  ownerId: string,
  cfg: Record<string, unknown>,
  ctx: Record<string, unknown>,
): Promise<{ info?: string }> {
  const actionType = String(cfg.type ?? "");

  if (actionType === "movimentacao_estoque") {
    const { error, data } = await supabase.from("movimentacoes_estoque").insert({
      owner_id: ownerId,
      tipo: String(cfg.tipo ?? "entrada"),
      produto_id: (cfg.produto_id as string) ?? null,
      tanque_id: (cfg.tanque_id as string) ?? null,
      quantidade: Number(cfg.quantidade ?? 0),
      observacao: `[Automação] ${String(cfg.observacao ?? "")}`.trim(),
    }).select().single();
    if (error) throw new Error(error.message);
    return { info: data?.id };
  }

  if (actionType === "webhook_http") {
    const res = await fetch(String(cfg.url ?? ""), {
      method: String(cfg.metodo ?? "POST"),
      headers: { "Content-Type": "application/json", ...((cfg.headers as Record<string, string>) ?? {}) },
      body: ["GET", "DELETE"].includes(String(cfg.metodo ?? "POST"))
        ? undefined
        : typeof cfg.body === "string" && cfg.body.length
          ? cfg.body
          : JSON.stringify({ trigger: ctx }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return { info: `HTTP ${res.status}` };
  }

  if (actionType === "enviar_alerta" || actionType === "criar_aviso" || actionType === "criar_tarefa") {
    const titulo = String(cfg.titulo ?? "Aviso da automação");
    const mensagem = String(cfg.mensagem ?? titulo);
    const severidade = String(cfg.severidade ?? "info");
    const categoria = actionType === "criar_tarefa" ? "tarefa"
      : actionType === "criar_aviso" ? "aviso" : "alerta";
    const { error } = await supabase.from("alertas_disparos").insert({
      owner_id: ownerId,
      alerta_id: null,
      alerta_nome: titulo,
      severidade,
      mensagem,
      categoria,
      contexto: ctx as unknown as Record<string, unknown>,
    });
    if (error) throw new Error(error.message);
    return { info: `${categoria}: ${titulo}` };
  }

  if (actionType === "criar_ordem") {
    const { data: prod } = await supabase
      .from("produtos").select("codigo").eq("id", cfg.produto_id as string).maybeSingle();
    const numero = `AUTO-${Date.now()}`;
    const { error, data } = await supabase.from("ordens_producao").insert({
      owner_id: ownerId,
      numero,
      produto_id: cfg.produto_id as string,
      equipamento_id: cfg.equipamento_id as string,
      qtd_planejada: Number(cfg.quantidade ?? 0),
      status: "programada",
      prioridade: String(cfg.prioridade ?? "media"),
      auto_iniciar: cfg.auto_iniciar === true,
    }).select().single();
    if (error) throw new Error(error.message);
    return { info: `OP ${data?.numero ?? numero} criada (${prod?.codigo ?? ""})` };
  }

  if (actionType === "iniciar_op") {
    const equipId = (cfg.equipamento_id as string) ?? null;
    if (!equipId) throw new Error("equipamento_id obrigatório");
    // verifica disponibilidade
    const { data: equip } = await supabase
      .from("equipamentos").select("status").eq("id", equipId).maybeSingle();
    if (equip?.status === "ocupado") throw new Error("equipamento ocupado");
    // próxima programada
    const { data: prox } = await supabase
      .from("ordens_producao")
      .select("id, numero")
      .eq("equipamento_id", equipId).eq("status", "programada")
      .order("fila_posicao", { ascending: true, nullsFirst: false })
      .order("inicio_previsto", { ascending: true, nullsFirst: false })
      .limit(1).maybeSingle();
    if (!prox) throw new Error("nenhuma OP programada na fila");
    const { data: nowRes } = await supabase.rpc("server_now");
    const { error } = await supabase.from("ordens_producao")
      .update({ status: "em_andamento", inicio_em: nowRes, fila_posicao: null })
      .eq("id", prox.id);
    if (error) throw new Error(error.message);
    await supabase.from("equipamentos").update({ status: "ocupado" }).eq("id", equipId);
    return { info: `OP ${prox.numero} iniciada` };
  }

  if (actionType === "finalizar_op") {
    const equipId = (cfg.equipamento_id as string) ?? null;
    if (!equipId) throw new Error("equipamento_id obrigatório");
    const { data: op } = await supabase
      .from("ordens_producao")
      .select("id, numero, qtd_planejada")
      .eq("equipamento_id", equipId).eq("status", "em_andamento")
      .order("inicio_em", { ascending: false }).limit(1).maybeSingle();
    if (!op) throw new Error("nenhuma OP em andamento neste equipamento");

    // Quantidade produzida: vem da tag (se configurada e existir), senão usa planejada.
    let qtdProduzida: number = Number(op.qtd_planejada ?? 0);
    let qtdOrigem = "planejada";
    const tagQtd = (cfg.qtd_produzida_tag as string) ?? "";
    if (tagQtd) {
      const { data: tag } = await supabase
        .from("tags_live").select("valor_num")
        .eq("owner_id", ownerId).eq("nome", tagQtd).maybeSingle();
      if (tag?.valor_num != null) {
        qtdProduzida = Number(tag.valor_num);
        qtdOrigem = `tag ${tagQtd}`;
      }
    }

    const { data: nowRes } = await supabase.rpc("server_now");
    const { error } = await supabase.from("ordens_producao").update({
      status: "finalizada",
      fim_em: nowRes,
      qtd_produzida: qtdProduzida,
      obs_finais: `[Automação] finalização automática (${qtdOrigem})`,
    }).eq("id", op.id);
    if (error) throw new Error(error.message);
    await supabase.from("equipamentos").update({ status: "disponivel" }).eq("id", equipId);

    // promove próxima programada com auto_iniciar
    const { data: prox } = await supabase
      .from("ordens_producao")
      .select("id")
      .eq("equipamento_id", equipId).eq("status", "programada").eq("auto_iniciar", true)
      .order("fila_posicao", { ascending: true, nullsFirst: false })
      .limit(1).maybeSingle();
    if (prox?.id) {
      await supabase.from("ordens_producao")
        .update({ status: "em_andamento", inicio_em: nowRes, fila_posicao: null })
        .eq("id", prox.id);
      await supabase.from("equipamentos").update({ status: "ocupado" }).eq("id", equipId);
    }
    return { info: `OP ${op.numero} finalizada (${qtdProduzida} ${qtdOrigem})` };
  }

  if (actionType === "avancar_ordem") {
    const ordemId = (cfg.ordem_id as string) ?? (ctx.ordem_id as string);
    if (!ordemId) throw new Error("ordem_id ausente");
    const { error } = await supabase.from("ordens_producao")
      .update({ status: String(cfg.proximo_status ?? "em_andamento") })
      .eq("id", ordemId);
    if (error) throw new Error(error.message);
    return {};
  }

  if (actionType === "gerar_relatorio") {
    // Cria registro de aviso com link/contexto para o relatório.
    // Geração de PDF real fica no front; aqui registramos a solicitação.
    const titulo = String(cfg.titulo ?? "Relatório gerado");
    await supabase.from("alertas_disparos").insert({
      owner_id: ownerId,
      alerta_nome: titulo,
      severidade: "info",
      mensagem: `Relatório "${cfg.tipo ?? "produção"}" solicitado pela automação`,
      categoria: "aviso",
      contexto: { tipo: cfg.tipo, escopo: cfg.escopo, ...ctx },
    });
    return { info: titulo };
  }

  if (actionType === "aguardar") {
    const segundos = Math.min(Math.max(Number(cfg.segundos ?? 0), 0), 60);
    await new Promise((r) => setTimeout(r, segundos * 1000));
    return { info: `aguardou ${segundos}s` };
  }

  throw new Error(`ação desconhecida: ${actionType}`);
}

async function runGraph(
  supabase: any,
  ownerId: string,
  graph: Graph,
  triggerContext: Record<string, unknown>,
): Promise<{ ok: boolean; results: ActionResult[] }> {
  const results: ActionResult[] = [];
  let okAll = true;

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const trigger = graph.nodes.find((n) => n.type === "trigger");
  const hasEdges = graph.edges.length > 0;

  // Ordered traversal: BFS from trigger via edges; if no edges, fall back to node array order (action/condition).
  let ordered: GraphNode[];
  if (trigger && hasEdges) {
    const out = new Map<string, string[]>();
    for (const e of graph.edges) {
      out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    }
    const seen = new Set<string>();
    const queue: string[] = [trigger.id];
    ordered = [];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (node && node.type !== "trigger") ordered.push(node);
      for (const next of out.get(id) ?? []) queue.push(next);
    }
  } else {
    ordered = graph.nodes.filter((n) => n.type !== "trigger");
  }

  let stopAfterCondition = false;

  for (const node of ordered) {
    const cfg = (node.data?.config ?? {}) as Record<string, unknown>;
    const label = node.data?.label ?? node.type;

    if (stopAfterCondition) {
      results.push({
        node: node.id, kind: node.type, action: String(cfg.type ?? ""),
        ok: true, skipped: true, info: "ignorada (condição anterior falhou)",
      });
      continue;
    }

    try {
      if (node.type === "condition") {
        const res = await evaluateCondition(supabase, ownerId, cfg);
        results.push({
          node: node.id, kind: "condition", action: String(cfg.type ?? ""),
          ok: true, info: `${label}: ${res.ok ? "✓" : "✗"} ${res.reason ?? ""}`,
        });
        if (!res.ok) stopAfterCondition = true;
      } else if (node.type === "action") {
        const out = await runActionNode(supabase, ownerId, cfg, triggerContext);
        results.push({
          node: node.id, kind: "action", action: String(cfg.type ?? ""),
          ok: true, info: out.info,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        node: node.id, kind: node.type, action: String(cfg.type ?? ""),
        ok: false, error: msg,
      });
      okAll = false;
      // não bloqueia próximas ações do fluxo — apenas registra a falha.
    }
  }

  return { ok: okAll, results };
}

async function executeRunInternal(supabase: any, userId: string, runId: string) {
  const { data: run, error: e1 } = await supabase
    .from("automation_runs").select("*").eq("id", runId).maybeSingle();
  if (e1 || !run) throw new Error("Execução não encontrada");
  if (run.owner_id !== userId) throw new Error("Sem permissão");
  if (!["pending_approval", "approved", "snoozed"].includes(run.status)) {
    throw new Error("Execução não está pendente");
  }

  await supabase.from("automation_runs").update({
    status: "executing",
    approved_by: userId,
    approved_at: new Date().toISOString(),
  }).eq("id", runId);

  const graph = parseGraph(run.planned_actions);
  const ctx = (run.trigger_context ?? {}) as Record<string, unknown>;
  const result = await runGraph(supabase, userId, graph, ctx);

  await supabase.from("automation_runs").update({
    status: result.ok ? "completed" : "failed",
    executed_at: new Date().toISOString(),
    result: JSON.parse(JSON.stringify(result)),
    error_message: result.ok ? null : result.results.find((r) => !r.ok)?.error ?? "Falha",
  }).eq("id", runId);

  return { ok: result.ok, results: result.results };
}

export const approveRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    return executeRunInternal(context.supabase, context.userId, data.runId);
  });

export const executeRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    return executeRunInternal(context.supabase, context.userId, data.runId);
  });

export const rejectRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("automation_runs").update({
      status: "rejected",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    }).eq("id", data.runId).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const snoozeRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string; minutes: number }) =>
    z.object({ runId: z.string().uuid(), minutes: z.number().min(1).max(1440) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const until = new Date(Date.now() + data.minutes * 60 * 1000).toISOString();
    const { error } = await supabase.from("automation_runs").update({
      status: "snoozed",
      snoozed_until: until,
    }).eq("id", data.runId).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
