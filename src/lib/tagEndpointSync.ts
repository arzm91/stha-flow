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

    return Object.entries(obj).map(([nome, valor]) =>
      valor && typeof valor === "object" && !Array.isArray(valor)
        ? { nome, ...(valor as IncomingTag) }
        : { nome, valor },
    );
  }
  return [];
}

function rowsFromPayload(input: unknown, endpointName: string, now: string) {
  return normalize(input)
    .map((tag) => {
      const nome = (tag.nome || tag.name || tag.tag || "").toString().trim();
      if (!nome) return null;
      const valor = tag.valor ?? tag.value ?? null;
      const valorNum =
        typeof valor === "number"
          ? valor
          : typeof valor === "string" && valor.trim() !== "" && !Number.isNaN(Number(valor))
            ? Number(valor)
            : null;

      return {
        nome,
        valor: valor === null || valor === undefined ? null : String(valor),
        valor_num: valorNum,
        unidade: tag.unidade ?? tag.unit ?? null,
        grupo: tag.grupo ?? tag.group ?? endpointName,
        qualidade: tag.qualidade ?? tag.quality ?? null,
        atualizado_em: now,
        origem: "endpoint",
      };
    })
    .filter(Boolean);
}

async function fetchEndpointPayload(endpoint: Pick<TagEndpoint, "url" | "metodo" | "headers" | "body">) {
  const method = endpoint.metodo || "GET";
  const response = await fetch(endpoint.url, {
    method,
    headers: { Accept: "application/json", ...(endpoint.headers ?? {}) },
    body: method !== "GET" && endpoint.body ? endpoint.body : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${text ? ` — ${text.slice(0, 300)}` : ""}`);
  }

  try {
    return { payload: JSON.parse(text), sample: text.slice(0, 400) };
  } catch {
    throw new Error("Resposta não é JSON válido");
  }
}

export async function testTagEndpointUrl(url: string, headers: Record<string, string>) {
  const { payload, sample } = await fetchEndpointPayload({ url, headers, metodo: "GET", body: null });
  return { count: normalize(payload).length, sample };
}

export async function syncTagEndpoint(endpoint: TagEndpoint) {
  const now = new Date().toISOString();
  try {
    const { payload } = await fetchEndpointPayload(endpoint);
    const rows = rowsFromPayload(payload, endpoint.nome, now);

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("tags_live" as never)
        .upsert(rows as never, { onConflict: "nome" });
      if (upsertError) throw upsertError;
    }

    const { error: statusError } = await supabase
      .from("tag_endpoints" as never)
      .update({
        ultima_execucao: now,
        ultimo_status: `OK ${rows.length} tags`,
        ultimo_erro: null,
        tags_recebidas: rows.length,
      } as never)
      .eq("id", endpoint.id);
    if (statusError) throw statusError;

    return { id: endpoint.id, ok: true, count: rows.length };
  } catch (error: any) {
    const message = String(error?.message ?? error).slice(0, 500);
    await supabase
      .from("tag_endpoints" as never)
      .update({ ultima_execucao: now, ultimo_status: message.startsWith("HTTP ") ? message.split(" — ")[0] : "ERRO", ultimo_erro: message } as never)
      .eq("id", endpoint.id);
    return { id: endpoint.id, ok: false, error: message };
  }
}

async function listEndpoints(activeOnly: boolean) {
  let query = supabase
    .from("tag_endpoints" as never)
    .select("id,nome,url,metodo,headers,body,intervalo_segundos,ativo,ultima_execucao");

  if (activeOnly) query = query.eq("ativo", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as TagEndpoint[];
}

export async function syncDueTagEndpoints() {
  const endpoints = await listEndpoints(true);
  const now = Date.now();
  const due = endpoints.filter((endpoint) => {
    if (!endpoint.ultima_execucao) return true;
    const elapsedSeconds = (now - new Date(endpoint.ultima_execucao).getTime()) / 1000;
    return elapsedSeconds >= (endpoint.intervalo_segundos ?? 60);
  });

  const results = [];
  for (const endpoint of due) results.push(await syncTagEndpoint(endpoint));
  return { ok: true, processed: results.length, results };
}

export async function syncAllTagEndpoints() {
  const endpoints = await listEndpoints(true);
  const results = [];
  for (const endpoint of endpoints) results.push(await syncTagEndpoint(endpoint));
  return { ok: true, processed: results.length, results };
}

export async function syncTagEndpointById(id: string) {
  const { data, error } = await supabase
    .from("tag_endpoints" as never)
    .select("id,nome,url,metodo,headers,body,intervalo_segundos,ativo,ultima_execucao")
    .eq("id", id)
    .single();
  if (error) throw error;
  const result = await syncTagEndpoint(data as unknown as TagEndpoint);
  return { ok: true, processed: 1, results: [result] };
}