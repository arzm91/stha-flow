import { createFileRoute } from "@tanstack/react-router";

// Endpoint chamado por pg_cron (ou manualmente) para buscar tags
// de fontes externas cadastradas em `tag_endpoints` e gravar em `tags_live`.

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

type EndpointRow = {
  id: string;
  nome: string;
  url: string;
  metodo: string;
  headers: Record<string, string> | null;
  body: string | null;
  intervalo_segundos: number;
  ativo: boolean;
  ultima_execucao: string | null;
};

type IncomingTag = {
  nome?: string;
  name?: string;
  tag?: string;
  valor?: unknown;
  value?: unknown;
  unidade?: string;
  unit?: string;
  grupo?: string;
  group?: string;
  qualidade?: string;
  quality?: string;
};

function normalize(input: unknown): IncomingTag[] {
  if (!input) return [];
  if (Array.isArray(input)) return input as IncomingTag[];
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.tags)) return obj.tags as IncomingTag[];
    if (Array.isArray(obj.data)) return obj.data as IncomingTag[];
    if (Array.isArray(obj.items)) return obj.items as IncomingTag[];
    // Mapa { tagName: value }
    const out: IncomingTag[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out.push({ nome: k, ...(v as IncomingTag) });
      } else {
        out.push({ nome: k, valor: v as unknown });
      }
    }
    return out;
  }
  return [];
}

async function processOne(ep: EndpointRow, supabaseAdmin: any) {
  const now = new Date().toISOString();
  try {
    const res = await fetch(ep.url, {
      method: ep.metodo || "GET",
      headers: { Accept: "application/json", ...(ep.headers ?? {}) },
      body: ep.metodo && ep.metodo !== "GET" && ep.body ? ep.body : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      await supabaseAdmin.from("tag_endpoints").update({
        ultima_execucao: now,
        ultimo_status: `HTTP ${res.status}`,
        ultimo_erro: (await res.text()).slice(0, 500),
      }).eq("id", ep.id);
      return { id: ep.id, ok: false, status: res.status };
    }
    const data = await res.json();
    const tags = normalize(data);
    const rows = tags
      .map((t) => {
        const nome = (t.nome || t.name || t.tag || "").toString().trim();
        if (!nome) return null;
        const valor = t.valor ?? t.value ?? null;
        const num =
          typeof valor === "number"
            ? valor
            : typeof valor === "string" && valor.trim() !== "" && !isNaN(Number(valor))
              ? Number(valor)
              : null;
        return {
          nome,
          valor: valor === null || valor === undefined ? null : String(valor),
          valor_num: num,
          unidade: t.unidade ?? t.unit ?? null,
          grupo: t.grupo ?? t.group ?? ep.nome,
          qualidade: t.qualidade ?? t.quality ?? null,
          atualizado_em: now,
        };
      })
      .filter(Boolean);

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.rpc("ingest_tags" as any, {
        payload: rows as any,
      } as any);
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("tag_endpoints").update({
      ultima_execucao: now,
      ultimo_status: `OK ${rows.length} tags`,
      ultimo_erro: null,
      tags_recebidas: rows.length,
    }).eq("id", ep.id);

    return { id: ep.id, ok: true, count: rows.length };
  } catch (e: any) {
    await supabaseAdmin.from("tag_endpoints").update({
      ultima_execucao: now,
      ultimo_status: "ERRO",
      ultimo_erro: String(e?.message ?? e).slice(0, 500),
    }).eq("id", ep.id);
    return { id: ep.id, ok: false, error: String(e?.message ?? e) };
  }
}

async function handleTest(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "JSON inválido" }, 400);
  }
  const targetUrl = String(body?.url ?? "").trim();
  const headers = (body?.headers && typeof body.headers === "object") ? body.headers : {};
  if (!/^https?:\/\//i.test(targetUrl)) {
    return json({ ok: false, message: "URL deve começar com http:// ou https://" }, 400);
  }
  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      return json({ ok: false, message: `HTTP ${res.status}`, sample: text });
    }
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch {
      return json({ ok: false, message: "Resposta não é JSON válido", sample: text.slice(0, 400) });
    }
    const tags = normalize(data);
    return json({
      ok: true,
      count: tags.length,
      sample: JSON.stringify(data, null, 2).slice(0, 400),
    });
  } catch (e: any) {
    return json({
      ok: false,
      message: e?.name === "TimeoutError" ? "Timeout (10s)" : String(e?.message ?? e),
    });
  }
}

async function handle(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("test") === "1") return handleTest(request);
  const idParam = url.searchParams.get("id");
  const force = url.searchParams.get("force") === "1";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin.from("tag_endpoints").select("*").eq("ativo", true);
  if (idParam) query = supabaseAdmin.from("tag_endpoints").select("*").eq("id", idParam);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const candidatos = (data ?? []) as EndpointRow[];
  const agora = Date.now();
  const dueList = idParam || force
    ? candidatos
    : candidatos.filter((ep) => {
        if (!ep.ultima_execucao) return true;
        const diff = (agora - new Date(ep.ultima_execucao).getTime()) / 1000;
        return diff >= (ep.intervalo_segundos ?? 60);
      });

  const results = [];
  for (const ep of dueList) {
    results.push(await processOne(ep, supabaseAdmin));
  }
  return json({ ok: true, processed: results.length, results });
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

