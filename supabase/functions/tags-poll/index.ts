import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-api-key",
};

type EndpointRow = {
  id: string;
  nome: string;
  url: string;
  metodo: string | null;
  headers: Record<string, string> | null;
  body: string | null;
  intervalo_segundos: number | null;
  ativo: boolean;
  ultima_execucao: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function hasValidApiKey(request: Request) {
  const url = new URL(request.url);
  const internalProvided = request.headers.get("x-tags-poll-secret");
  const internalExpected = Deno.env.get("TAGS_POLL_SECRET");
  if (internalProvided && internalExpected && internalProvided === internalExpected) return true;

  const publicProvided = request.headers.get("apikey") || request.headers.get("x-api-key") || url.searchParams.get("key");
  const publicExpected = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  return Boolean(
    publicProvided &&
      ((publicExpected && publicProvided === publicExpected) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(publicProvided)),
  );
}

function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Backend não configurado para sincronização");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchEndpoint(ep: EndpointRow) {
  const method = (ep.metodo || "GET").toUpperCase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(ep.url, {
      method,
      headers: { Accept: "application/json", ...(ep.headers ?? {}) },
      body: method !== "GET" && ep.body ? ep.body : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function processOne(ep: EndpointRow, supabaseAdmin: ReturnType<typeof createAdminClient>) {
  const now = new Date().toISOString();
  try {
    const res = await fetchEndpoint(ep);
    if (!res.ok) {
      await supabaseAdmin
        .from("tag_endpoints")
        .update({
          ultima_execucao: now,
          ultimo_status: `HTTP ${res.status}`,
          ultimo_erro: res.text.slice(0, 500),
        })
        .eq("id", ep.id);
      return { id: ep.id, ok: false, status: res.status, error: res.text.slice(0, 160) };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(res.text);
    } catch {
      await supabaseAdmin
        .from("tag_endpoints")
        .update({
          ultima_execucao: now,
          ultimo_status: "ERRO PARSE",
          ultimo_erro: "Resposta não é JSON válido",
        })
        .eq("id", ep.id);
      return { id: ep.id, ok: false, error: "Resposta não é JSON válido" };
    }

    const { data: ingested, error } = await supabaseAdmin.rpc("ingest_endpoint_payload", {
      p_endpoint_id: ep.id,
      p_endpoint_name: ep.nome,
      p_payload: payload,
    });
    if (error) throw new Error(error.message);

    const count = Number(ingested ?? 0);
    await supabaseAdmin
      .from("tag_endpoints")
      .update({
        ultima_execucao: now,
        ultimo_status: `OK ${count} tags`,
        ultimo_erro: null,
        tags_recebidas: count,
      })
      .eq("id", ep.id);

    return { id: ep.id, ok: true, count };
  } catch (e) {
    const message = e instanceof Error && e.name === "AbortError" ? "Timeout (15s)" : String(e instanceof Error ? e.message : e);
    await supabaseAdmin
      .from("tag_endpoints")
      .update({
        ultima_execucao: now,
        ultimo_status: "ERRO",
        ultimo_erro: message.slice(0, 500),
      })
      .eq("id", ep.id);
    return { id: ep.id, ok: false, error: message };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!hasValidApiKey(request)) return json({ ok: false, message: "Não autorizado" }, 401);

  const url = new URL(request.url);
  const idParam = url.searchParams.get("id");
  const force = url.searchParams.get("force") === "1";
  const supabaseAdmin = createAdminClient();

  let query = supabaseAdmin.from("tag_endpoints").select("*").eq("ativo", true);
  if (idParam) query = supabaseAdmin.from("tag_endpoints").select("*").eq("id", idParam);

  const { data, error } = await query;
  if (error) return json({ ok: false, error: error.message }, 500);

  const endpoints = (data ?? []) as EndpointRow[];
  const now = Date.now();
  const dueList = idParam || force
    ? endpoints
    : endpoints.filter((ep) => {
      if (!ep.ultima_execucao) return true;
      const diffSeconds = (now - new Date(ep.ultima_execucao).getTime()) / 1000;
      return diffSeconds >= Math.max(ep.intervalo_segundos ?? 60, 1);
    });

  const results = [];
  for (const ep of dueList) {
    results.push(await processOne(ep, supabaseAdmin));
  }

  return json({ ok: true, processed: results.length, results });
});