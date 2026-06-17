import { supabase } from "@/integrations/supabase/client";

export type TagEndpoint = {
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

function getPublicApiKey() {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
}

async function callPollRoute(search: string) {
  const res = await fetch(`/api/public/tags/poll${search}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(getPublicApiKey() ? { apikey: getPublicApiKey()! } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data as { ok?: boolean; processed?: number; results?: Array<{ id: string; ok: boolean; count?: number; error?: string; status?: number }> };
}

/**
 * Manual sync runs through the app server route, which uses native HTTP for
 * direct-IP http:// endpoints. This avoids browser mixed-content blocks and
 * the database network timeout seen with pg_net.
 */
export async function syncTagEndpointById(id: string) {
  const data = await callPollRoute(`?id=${encodeURIComponent(id)}&force=1`);
  const result = data.results?.[0];
  if (!data.ok || !result?.ok) {
    throw new Error(result?.error || `Falha ao sincronizar (status ${result?.status ?? "?"})`);
  }
  return { ok: true, processed: 1, results: [{ id, ok: true, count: result.count ?? 0 }] };
}

export async function syncAllTagEndpoints() {
  const data = await callPollRoute("?force=1");
  return { ok: Boolean(data.ok), processed: data.processed ?? 0, results: data.results ?? [] };
}

/**
 * Test endpoint connectivity — also runs via the server (pg_net) for the
 * same network-reachability reasons. We trigger a sync and read back status.
 */
export async function testTagEndpointById(id: string) {
  const result = await syncTagEndpointById(id);
  return { count: result.results[0]?.count ?? 0 };
}
