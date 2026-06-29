import { createFileRoute } from "@tanstack/react-router";

// Endpoint chamado pela tela e por automações. Ele delega a busca real para a
// função de backend dedicada, que não sofre a restrição HTTP 403 do ambiente do app publicado.

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

function hasValidApiKey(request: Request) {
  const provided = request.headers.get("apikey") || request.headers.get("x-api-key");
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  return Boolean(provided && expected && provided === expected);
}

async function handle(request: Request) {
  if (!hasValidApiKey(request)) return json({ ok: false, message: "Não autorizado" }, 401);
  const url = new URL(request.url);

  const backendUrl = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!backendUrl || !apiKey) {
    return json({ ok: false, message: "Backend não configurado para sincronização" }, 500);
  }

  const functionUrl = `${backendUrl.replace(/\/$/, "")}/functions/v1/tags-poll${url.search}`;
  const res = await fetch(functionUrl, {
    method: request.method === "GET" ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      apikey: apiKey,
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

