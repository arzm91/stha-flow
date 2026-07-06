import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_tags_live",
  title: "Listar tags ao vivo",
  description: "Retorna os valores atuais das tags monitoradas. Filtro opcional por nome (busca parcial).",
  inputSchema: {
    nome: z.string().optional().describe("Filtro parcial pelo nome da tag."),
    limit: z.number().int().min(1).max(500).optional().describe("Quantidade máxima (padrão 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ nome, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("tags_live")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 100);
    if (nome) q = q.ilike("nome", `%${nome}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { count: data?.length ?? 0, tags: data ?? [] },
    };
  },
});
