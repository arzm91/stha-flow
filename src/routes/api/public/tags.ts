import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-ingest-token",
  "Access-Control-Max-Age": "86400",
};

const tagSchema = z.object({
  nome: z.string().min(1).max(120),
  valor: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  unidade: z.string().max(20).optional().nullable(),
  grupo: z.string().max(60).optional().nullable(),
  qualidade: z.string().max(20).optional().nullable(),
});

const payloadSchema = z.union([
  tagSchema,
  z.object({ tags: z.array(tagSchema).min(1).max(500) }),
  z.array(tagSchema).min(1).max(500),
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/tags")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const expected = process.env.TAGS_INGEST_TOKEN;
        if (expected) {
          const provided =
            request.headers.get("x-ingest-token") ||
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
          if (provided !== expected) {
            return json({ error: "Unauthorized" }, 401);
          }
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
        }

        const list = Array.isArray(parsed.data)
          ? parsed.data
          : "tags" in parsed.data
            ? parsed.data.tags
            : [parsed.data];

        const now = new Date().toISOString();
        const rows = list.map((t) => {
          const num =
            typeof t.valor === "number"
              ? t.valor
              : typeof t.valor === "string" && t.valor.trim() !== "" && !isNaN(Number(t.valor))
                ? Number(t.valor)
                : null;
          const txt = t.valor === null || t.valor === undefined ? null : String(t.valor);
          return {
            nome: t.nome,
            valor: txt,
            valor_num: num,
            unidade: t.unidade ?? null,
            grupo: t.grupo ?? null,
            qualidade: t.qualidade ?? null,
            atualizado_em: now,
          };
        });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("tags_live")
          .upsert(rows, { onConflict: "nome" });

        if (error) {
          return json({ error: error.message }, 500);
        }
        return json({ ok: true, count: rows.length, at: now });
      },
    },
  },
});
