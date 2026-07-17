import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Roda periodicamente (via pg_cron). Para cada tag calculada do tipo
 * "delta_janela" cujo horário de captura configurado já passou hoje (fuso
 * America/Sao_Paulo) e ainda não tem snapshot do dia, grava o valor atual da
 * tag de origem em tag_snapshots_diarios. Em seguida, calcula
 * (snapshot_hoje - snapshot_de_N_dias_atrás), armazena em
 * tags_calculadas.ultimo_valor_calc e propaga para tags_live.
 *
 * Auth: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

type CalcTagDelta = {
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
  snapshot_tag_nome: string | null;
  snapshot_hora: string | null;
  snapshot_janela_dias: number | null;
};

// Retorna { dia: 'YYYY-MM-DD', hora: 'HH:MM' } no fuso America/Sao_Paulo.
function nowInSaoPaulo(): { dia: string; hora: string; totalMin: number } {
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
  const dia = `${parts.year}-${parts.month}-${parts.day}`;
  const hora = `${parts.hour}:${parts.minute}`;
  const totalMin = Number(parts.hour) * 60 + Number(parts.minute);
  return { dia, hora, totalMin };
}

function subtractDays(diaIso: string, days: number): string {
  const d = new Date(`${diaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function normalizeHora(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(input.trim());
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export const Route = createFileRoute("/api/public/tags/snapshot-diario")({
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
            "id,nome,nome_amigavel,unidade,grupo,decimais,valor_min,valor_max,owner_id,tipo,snapshot_tag_nome,snapshot_hora,snapshot_janela_dias",
          )
          .eq("ativo", true)
          .eq("tipo", "delta_janela");

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        const tags = (rows ?? []) as unknown as CalcTagDelta[];
        const now = nowInSaoPaulo();
        const results: Array<{ tag: string; owner_id: string; status: string; delta?: number | null }> = [];

        for (const t of tags) {
          const hora = normalizeHora(t.snapshot_hora);
          const sourceTag = (t.snapshot_tag_nome ?? "").trim();
          const janela = Number(t.snapshot_janela_dias ?? 1);
          if (!hora || !sourceTag || !Number.isFinite(janela) || janela < 1) {
            results.push({ tag: t.nome, owner_id: t.owner_id, status: "config_incompleta" });
            continue;
          }
          const [hh, mm] = hora.split(":").map(Number);
          const targetMin = hh * 60 + mm;
          if (now.totalMin < targetMin) {
            results.push({ tag: t.nome, owner_id: t.owner_id, status: "aguardando_horario" });
            continue;
          }

          // Já existe snapshot de hoje?
          const { data: existing } = await admin
            .from("tag_snapshots_diarios")
            .select("id,valor_num")
            .eq("owner_id", t.owner_id)
            .eq("tag_nome", sourceTag)
            .eq("hora_ref", hora)
            .eq("dia_ref", now.dia)
            .maybeSingle();

          let snapshotHojeValor: number | null = existing?.valor_num != null ? Number(existing.valor_num) : null;

          if (!existing) {
            const { data: live } = await admin
              .from("tags_live")
              .select("valor_num")
              .eq("owner_id", t.owner_id)
              .eq("nome", sourceTag)
              .maybeSingle();
            const valor = live?.valor_num != null ? Number(live.valor_num) : null;
            const { error: insErr } = await admin.from("tag_snapshots_diarios").insert({
              owner_id: t.owner_id,
              tag_nome: sourceTag,
              hora_ref: hora,
              dia_ref: now.dia,
              valor_num: valor,
            });
            if (insErr) {
              results.push({ tag: t.nome, owner_id: t.owner_id, status: `erro_snapshot:${insErr.message}` });
              continue;
            }
            snapshotHojeValor = valor;
          }

          // Snapshot passado
          const diaPassado = subtractDays(now.dia, janela);
          const { data: passado } = await admin
            .from("tag_snapshots_diarios")
            .select("valor_num")
            .eq("owner_id", t.owner_id)
            .eq("tag_nome", sourceTag)
            .eq("hora_ref", hora)
            .eq("dia_ref", diaPassado)
            .maybeSingle();

          let delta: number | null = null;
          if (
            passado?.valor_num != null &&
            snapshotHojeValor != null &&
            Number.isFinite(Number(passado.valor_num)) &&
            Number.isFinite(snapshotHojeValor)
          ) {
            delta = snapshotHojeValor - Number(passado.valor_num);
          }

          await admin
            .from("tags_calculadas")
            .update({
              ultimo_valor_calc: delta,
              ultimo_valor_calc_em: new Date().toISOString(),
            })
            .eq("id", t.id);

          if (delta != null) {
            await admin.from("tags_live").upsert(
              {
                nome: t.nome,
                nome_amigavel: t.nome_amigavel,
                valor: String(delta),
                valor_num: delta,
                valor_num_bruto: delta,
                unidade: t.unidade,
                grupo: t.grupo ?? "Calculadas",
                qualidade: "good",
                valor_min: t.valor_min,
                valor_max: t.valor_max,
                origem: "calculada",
                owner_id: t.owner_id,
                atualizado_em: new Date().toISOString(),
              },
              { onConflict: "owner_id,nome" },
            );
          }

          results.push({ tag: t.nome, owner_id: t.owner_id, status: "ok", delta });
        }

        return Response.json({ ok: true, processed: tags.length, sao_paulo: now, results });
      },
    },
  },
});
