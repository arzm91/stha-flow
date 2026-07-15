import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Endpoint chamado pela tela e por automações. Delega a busca real para a
// função de backend dedicada. Requer usuário autenticado (Bearer token
// validado via Supabase Auth) — o segredo interno TAGS_POLL_SECRET nunca
// sai do servidor.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function isAuthenticated(request: Request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;
  const url = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !publishable) return false;
  const client = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  return Boolean(!error && data?.user?.id);
}

async function handle(request: Request) {
  if (!(await isAuthenticated(request))) {
    return json({ ok: false, message: "Não autorizado" }, 401);
  }
  const url = new URL(request.url);

  const backendUrl = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const internalSecret = process.env.TAGS_POLL_SECRET;
  if (!backendUrl || !apiKey || !internalSecret) {
    return json({ ok: false, message: "Backend não configurado para sincronização" }, 500);
  }

  const functionUrl = `${backendUrl.replace(/\/$/, "")}/functions/v1/tags-poll${url.search}`;
  const res = await fetch(functionUrl, {
    method: request.method === "GET" ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      apikey: apiKey,
      "x-tags-poll-secret": internalSecret,
    },
    body: request.method === "GET" ? undefined : await request.text().catch(() => "{}"),
    signal: AbortSignal.timeout(25_000),
  });

  const text = await res.text();
  try {
    return json(JSON.parse(text), res.status);
  } catch {
    return json({ ok: false, message: text || `HTTP ${res.status}` }, res.status);
  }
}

export const Route = createFileRoute("/api/public/tags/poll")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
