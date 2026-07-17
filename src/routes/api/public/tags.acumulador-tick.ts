import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Processa tags calculadas do tipo "acumulador_janela".
 *
 * Para cada tag ativa:
 * - Calcula o início da janela atual (reset diário em hora fixa OU a cada N horas),
 *   sempre no fuso America/Sao_Paulo.
 * - Se a janela mudou desde a última execução, zera o acumulado e trata o valor
 *   atual da tag de origem como novo baseline (delta considerado = 0).
 * - Caso contrário, soma apenas incrementos positivos: delta = max(0, atual − anterior).
 *   Se a fonte cair (rollover do totalizador), apenas atualiza o baseline sem somar.
 * - Persiste o estado em tags_calculadas e publica em tags_live.
 *
 * Auth: Bearer <SUPABASE_SERVICE_ROLE_KEY>. Chamado por pg_cron a cada minuto.
 */

type AcumTag = {
  id: string;
  nome: string;
  nome_amigavel: string | null;
  unidade: string | null;
  grupo: string | null;
  decimais: number;
  valor_min: number | null;
  valor_max: number | null;
  owner_id: string;
  tipo: string;
  acumulador_tag_nome: string | null;
  acumulador_reset_tipo: string | null;
  acumulador_reset_hora: string | null;
  acumulador_intervalo_horas: number | null;
  acumulador_ultimo_valor_fonte: number | null;
  acumulador_valor: number | null;
  acumulador_janela_inicio: string | null;
};

function nowInSaoPauloParts() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    mo: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    mi: Number(parts.minute),
  };
}

// Converte um instante "wall clock" em America/Sao_Paulo (Y-M-D H:M) para
// um Date UTC equivalente. São Paulo não usa DST desde 2019, mas calculamos
// o offset dinamicamente para robustez.
function saoPauloWallToUTC(y: number, mo: number, d: number, h: number, mi: number): Date {
  // Ponto de partida: assume o wall clock como se fosse UTC.
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  // Formata o guess no fuso SP; a diferença é o offset a compensar.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
  const asSP = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), 0,
  );
  const offsetMs = asSP - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

function normalizeHora(input: string | null | undefined): { h: number; m: number } | null {
  if (!input) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(input.trim());
  if (!m) return null;
  return {
    h: Math.max(0, Math.min(23, Number(m[1]))),
    m: Math.max(0, Math.min(59, Number(m[2]))),
  };
}

// Devolve o instante (em UTC) de início da janela atual dado o tipo de reset.
function computeWindowStart(tag: AcumTag): Date | null {
  const now = nowInSaoPauloParts();
  if (tag.acumulador_reset_tipo === "diario") {
    const hm = normalizeHora(tag.acumulador_reset_hora);
    if (!hm) return null;
    const nowMin = now.h * 60 + now.mi;
    const resetMin = hm.h * 60 + hm.m;
    let y = now.y, mo = now.mo, d = now.d;
    if (nowMin < resetMin) {
      // Janela atual começou ontem no horário
      const prev = new Date(Date.UTC(y, mo - 1, d));
      prev.setUTCDate(prev.getUTCDate() - 1);
      y = prev.getUTCFullYear();
      mo = prev.getUTCMonth() + 1;
      d = prev.getUTCDate();
    }
    return saoPauloWallToUTC(y, mo, d, hm.h, hm.m);
  }
  if (tag.acumulador_reset_tipo === "horas") {
    const iv = Number(tag.acumulador_intervalo_horas ?? 0);
    if (!Number.isFinite(iv) || iv < 1 || iv > 24) return null;
    // Janelas alinhadas à meia-noite SP
    const bucket = Math.floor(now.h / iv) * iv;
    return saoPauloWallToUTC(now.y, now.mo, now.d, bucket, 0);
  }
  return null;
}

export const Route = createFileRoute("/api/public/tags/acumulador-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
        if (!serviceKey || !supabaseUrl) {
          return Response.json({ error: "server_misconfigured" }, { status: 500 });
        }
        const authHeader = request.headers.get("Authorization") ?? "";
        if (!authHeader.startsWith("Bearer ") || authHeader.slice(7).trim() !== serviceKey) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: rows, error } = await admin
          .from("tags_calculadas")
          .select(
            "id,nome,nome_amigavel,unidade,grupo,decimais,valor_min,valor_max,owner_id,tipo,acumulador_tag_nome,acumulador_reset_tipo,acumulador_reset_hora,acumulador_intervalo_horas,acumulador_ultimo_valor_fonte,acumulador_valor,acumulador_janela_inicio",
          )
          .eq("ativo", true)
          .eq("tipo", "acumulador_janela");

        if (error) return Response.json({ error: error.message }, { status: 500 });

        const tags = (rows ?? []) as unknown as AcumTag[];
        const results: Array<Record<string, unknown>> = [];

        for (const t of tags) {
          const src = (t.acumulador_tag_nome ?? "").trim();
          if (!src) { results.push({ tag: t.nome, status: "sem_fonte" }); continue; }

          const winStart = computeWindowStart(t);
          if (!winStart) { results.push({ tag: t.nome, status: "config_incompleta" }); continue; }

          const { data: live } = await admin
            .from("tags_live")
            .select("valor_num")
            .eq("owner_id", t.owner_id)
            .eq("nome", src)
            .maybeSingle();
          const atual = live?.valor_num != null ? Number(live.valor_num) : null;

          const prevStart = t.acumulador_janela_inicio ? new Date(t.acumulador_janela_inicio) : null;
          const trocouJanela = !prevStart || prevStart.getTime() !== winStart.getTime();

          let acumulado = trocouJanela ? 0 : Number(t.acumulador_valor ?? 0);
          let baseline = trocouJanela ? atual : (t.acumulador_ultimo_valor_fonte != null ? Number(t.acumulador_ultimo_valor_fonte) : atual);

          if (!trocouJanela && atual != null && baseline != null && Number.isFinite(atual) && Number.isFinite(baseline)) {
            const delta = atual - baseline;
            if (delta > 0) acumulado += delta;
            // se delta <= 0 (queda/rollover), não soma; apenas atualiza o baseline
            baseline = atual;
          } else if (atual != null) {
            baseline = atual;
          }

          const nowIso = new Date().toISOString();
          await admin
            .from("tags_calculadas")
            .update({
              acumulador_valor: acumulado,
              acumulador_ultimo_valor_fonte: baseline,
              acumulador_janela_inicio: winStart.toISOString(),
              ultimo_valor_calc: acumulado,
              ultimo_valor_calc_em: nowIso,
            })
            .eq("id", t.id);

          await admin.from("tags_live").upsert(
            {
              nome: t.nome,
              nome_amigavel: t.nome_amigavel,
              valor: String(acumulado),
              valor_num: acumulado,
              valor_num_bruto: acumulado,
              unidade: t.unidade,
              grupo: t.grupo ?? "Calculadas",
              qualidade: "good",
              valor_min: t.valor_min,
              valor_max: t.valor_max,
              origem: "calculada",
              owner_id: t.owner_id,
              atualizado_em: nowIso,
            },
            { onConflict: "owner_id,nome" },
          );

          results.push({
            tag: t.nome,
            owner_id: t.owner_id,
            status: trocouJanela ? "janela_nova" : "ok",
            acumulado,
            baseline,
            janela_inicio: winStart.toISOString(),
          });
        }

        return Response.json({ ok: true, processed: tags.length, results });
      },
    },
  },
});
