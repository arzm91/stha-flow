import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const idSchema = z.object({ runId: z.string().uuid() });

type PlannedAction = {
  id?: string;
  type?: string;
  data?: { config?: Record<string, unknown> };
} & Record<string, unknown>;

type ActionResult = { action: string; ok: boolean; error?: string; info?: string };

async function runActions(
  supabase: any,
  ownerId: string,
  actions: PlannedAction[],
  triggerContext: Record<string, unknown>,
): Promise<{ ok: boolean; results: ActionResult[] }> {
  const results: ActionResult[] = [];
  let okAll = true;

  for (const node of actions) {
    if (node.type !== "action") continue;
    const cfg = (node.data?.config ?? {}) as Record<string, unknown>;
    const actionType = String(cfg.type ?? "");
    try {
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
        results.push({ action: actionType, ok: true, data });
      } else if (actionType === "webhook_http") {
        const res = await fetch(String(cfg.url ?? ""), {
          method: String(cfg.metodo ?? "POST"),
          headers: { "Content-Type": "application/json", ...((cfg.headers as Record<string, string>) ?? {}) },
          body: ["GET", "DELETE"].includes(String(cfg.metodo ?? "POST"))
            ? undefined
            : typeof cfg.body === "string" && cfg.body.length
              ? cfg.body
              : JSON.stringify({ trigger: triggerContext }),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        results.push({ action: actionType, ok: true, info: `HTTP ${res.status}` });
      } else if (actionType === "enviar_alerta") {
        // Email integration is a follow-up; for now just records intent.
        results.push({ action: actionType, ok: true, info: String(cfg.titulo ?? "") });
      } else if (actionType === "criar_ordem") {
        const { error, data } = await supabase.from("ordens_producao").insert({
          owner_id: ownerId,
          produto_id: cfg.produto_id as string,
          quantidade_planejada: Number(cfg.quantidade ?? 0),
          status: "planejada",
        }).select().single();
        if (error) throw new Error(error.message);
        results.push({ action: actionType, ok: true, data });
      } else if (actionType === "avancar_ordem") {
        const ordemId = (cfg.ordem_id as string) ?? (triggerContext.ordem_id as string);
        if (!ordemId) throw new Error("ordem_id ausente");
        const { error } = await supabase.from("ordens_producao")
          .update({ status: String(cfg.proximo_status ?? "em_andamento") })
          .eq("id", ordemId);
        if (error) throw new Error(error.message);
        results.push({ action: actionType, ok: true });
      } else {
        results.push({ action: actionType || "desconhecida", ok: false, error: "Ação desconhecida" });
        okAll = false;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ action: actionType || "desconhecida", ok: false, error: msg });
      okAll = false;
    }
  }

  return { ok: okAll, results };
}

export const approveRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: run, error: e1 } = await supabase
      .from("automation_runs")
      .select("*")
      .eq("id", data.runId)
      .maybeSingle();
    if (e1 || !run) throw new Error("Execução não encontrada");
    if (run.owner_id !== userId) throw new Error("Sem permissão");
    if (run.status !== "pending_approval" && run.status !== "snoozed") {
      throw new Error("Execução não está pendente");
    }

    await supabase.from("automation_runs").update({
      status: "executing",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    }).eq("id", data.runId);

    const actions = Array.isArray(run.planned_actions) ? (run.planned_actions as PlannedAction[]) : [];
    const ctx = (run.trigger_context ?? {}) as Record<string, unknown>;
    const result = await runActions(supabase, userId, actions, ctx);

    await supabase.from("automation_runs").update({
      status: result.ok ? "completed" : "failed",
      executed_at: new Date().toISOString(),
      result: JSON.parse(JSON.stringify(result)),
      error_message: result.ok ? null : result.results.find(r => !r.ok)?.error ?? "Falha",
    }).eq("id", data.runId);

    return { ok: result.ok, results: result.results };
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
