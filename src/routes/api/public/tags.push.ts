import { createFileRoute } from "@tanstack/react-router";

// Webhook HTTPS para receber tags via POST (ex: Node-RED).
// Autenticação por push_token (cadastrado em tag_endpoints.push_token).
//
// Uso:
//   POST https://<app>/api/public/tags/push?token=<push_token>
//   Header alternativo: X-Push-Token: <push_token>
//   Body: JSON — array de tags, { tags: [...] }, { data: [...] },
//         { items: [...] } ou { nome: valor, ... }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Push-Token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const token =
    request.headers.get("x-push-token") ||
    url.searchParams.get("token") ||
    "";

  if (!token || token.length < 16) {
    return json({ ok: false, message: "Token ausente ou inválido" }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, message: "JSON inválido" }, 400);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: ep, error: epErr } = await supabaseAdmin
    .from("tag_endpoints")
    .select("id, nome, ativo")
    .eq("push_token", token)
    .maybeSingle();

  if (epErr) return json({ ok: false, message: epErr.message }, 500);
  if (!ep) return json({ ok: false, message: "Token não reconhecido" }, 401);
  if (!ep.ativo) return json({ ok: false, message: "Endpoint inativo" }, 403);

  const now = new Date().toISOString();

  const { data: ingested, error: ingErr } = await supabaseAdmin.rpc(
    "ingest_endpoint_payload" as any,
    {
      p_endpoint_id: ep.id,
      p_endpoint_name: ep.nome,
      p_payload: payload as any,
    } as any,
  );

  if (ingErr) {
    await supabaseAdmin
      .from("tag_endpoints")
      .update({
        ultima_execucao: now,
        ultimo_status: "ERRO PUSH",
        ultimo_erro: ingErr.message.slice(0, 500),
      })
      .eq("id", ep.id);
    return json({ ok: false, message: ingErr.message }, 500);
  }

  const count = Number(ingested ?? 0);
  await supabaseAdmin
    .from("tag_endpoints")
    .update({
      ultima_execucao: now,
      ultimo_status: `PUSH ${count} tags`,
      ultimo_erro: null,
      tags_recebidas: count,
    })
    .eq("id", ep.id);

  return json({ ok: true, count });
}

export const Route = createFileRoute("/api/public/tags/push")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => handle(request),
    },
  },
});
