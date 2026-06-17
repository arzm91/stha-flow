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

/**
 * Manual sync runs server-side via pg_net (the database makes the HTTP request).
 * Browser direct fetch is blocked by mixed-content (HTTPS → HTTP) and the
 * Cloudflare Worker runtime is blocked by error 1003 on direct-IP targets,
 * so pg_net is the only reliable path.
 */
export async function syncTagEndpointById(id: string) {
  const { data, error } = await supabase.rpc("sync_tag_endpoint_now" as never, {
    p_endpoint_id: id,
  } as never);
  if (error) throw error;
  const result = (data ?? {}) as { ok?: boolean; count?: number; error?: string; status?: number };
  if (!result.ok) {
    throw new Error(result.error || `Falha ao sincronizar (status ${result.status ?? "?"})`);
  }
  return { ok: true, processed: 1, results: [{ id, ok: true, count: result.count ?? 0 }] };
}

export async function syncAllTagEndpoints() {
  const { data, error } = await supabase
    .from("tag_endpoints" as never)
    .select("id")
    .eq("ativo", true);
  if (error) throw error;
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);

  const results: Array<{ id: string; ok: boolean; count?: number; error?: string }> = [];
  for (const id of ids) {
    try {
      const r = await syncTagEndpointById(id);
      results.push(r.results[0]);
    } catch (e: any) {
      results.push({ id, ok: false, error: String(e?.message ?? e) });
    }
  }
  return { ok: true, processed: results.length, results };
}

/**
 * Test endpoint connectivity — also runs via the server (pg_net) for the
 * same network-reachability reasons. We trigger a sync and read back status.
 */
export async function testTagEndpointById(id: string) {
  const result = await syncTagEndpointById(id);
  return { count: result.results[0]?.count ?? 0 };
}
