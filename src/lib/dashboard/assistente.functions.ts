import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateResponse, PaymentRequiredError, RateLimitError } from "@lovable.dev/ai-gateway";
import { WIDGET_SOURCES, getSource } from "@/lib/dashboard/widget-catalog";

const Input = z.object({
  pedido: z.string().trim().min(3).max(1000),
  atual: z.array(z.object({ fonte: z.string(), titulo: z.string() })).max(40).optional(),
});

const Sug = z.object({
  fonte: z.string(),
  titulo: z.string().max(80),
  tag_nome: z.string().optional().nullable(),
  tag_nomes: z.array(z.string()).max(12).optional().nullable(),
  equipamento_id: z.string().optional().nullable(),
  tank_id: z.string().optional().nullable(),
  meta: z.number().optional().nullable(),
  min: z.number().optional().nullable(),
  max: z.number().optional().nullable(),
  w: z.number().optional().nullable(),
  h: z.number().optional().nullable(),
});

export type SugestaoWidget = {
  fonte: string; titulo: string; tipo: string;
  config: Record<string, string | number | string[]>;
  layout: { x: number; y: number; w: number; h: number };
};

/** Monta um painel a partir de um pedido em texto, usando só dados da empresa do usuário. */
export const sugerirPainel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: owner } = await supabase.rpc("effective_owner", { _user: userId });
    if (!owner) throw new Error("Não foi possível identificar sua empresa.");

    const [tagsRes, equipRes, tankRes] = await Promise.all([
      supabase.from("tags_live").select("nome,nome_amigavel,grupo,unidade").eq("owner_id", owner).limit(600),
      supabase.from("equipamentos").select("id,nome").eq("owner_id", owner).limit(100),
      supabase.from("tanques").select("id,nome").eq("owner_id", owner).limit(100),
    ]);
    const tags = tagsRes.data ?? [];
    const tagSet = new Set(tags.map((t) => t.nome));
    const equipSet = new Set((equipRes.data ?? []).map((e) => e.id));
    const tankSet = new Set((tankRes.data ?? []).map((e) => e.id));

    const catalogo = WIDGET_SOURCES.map((s) => ({
      fonte: s.key, nome: s.label, grupo: s.grupo, desc: s.description,
      precisa: s.needsTag ? "tag_nome" : s.needsMultiTag ? "tag_nomes" : s.needsEquipamento ? "equipamento_id" : s.needsTank ? "tank_id" : s.key === "tv.meta" ? "meta" : undefined,
    }));

    const system =
      "Você monta painéis de dashboard industrial para exibir em TV. Responda APENAS JSON: {\"widgets\":[...]}. " +
      "Cada item: {fonte, titulo, tag_nome?, tag_nomes?, equipamento_id?, tank_id?, meta?, min?, max?, w (1-12), h (1-6)}. " +
      "Use SOMENTE fontes do CATALOGO e tags/equipamentos/tanques listados (nomes e ids exatos). " +
      "Prefira fontes do grupo TV. No máximo 9 cards; grade de 12 colunas; títulos curtos em português. " +
      "Se o usuário pedir ajustes sobre o painel ATUAL, devolva o painel completo já ajustado.";
    const user = `PEDIDO: ${data.pedido}\n\nATUAL: ${JSON.stringify(data.atual ?? [])}\n\nCATALOGO: ${JSON.stringify(catalogo)}\n\nTAGS: ${JSON.stringify(tags.map((t) => ({ nome: t.nome, apelido: t.nome_amigavel, grupo: t.grupo, un: t.unidade })))}\n\nEQUIPAMENTOS: ${JSON.stringify(equipRes.data ?? [])}\n\nTANQUES: ${JSON.stringify(tankRes.data ?? [])}`;
    let txt = "";
    try {
      const r = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions: system,
        input: user,
      });
      for (const o of (r as { output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> }).output ?? []) {
        if (o.type === "message") for (const c of o.content ?? []) if (c.type === "output_text") txt += c.text ?? "";
      }
    } catch (e) {
      console.error("sugerirPainel", e);
      if (e instanceof RateLimitError) throw new Error("Muitas solicitações. Tente em instantes.");
      if (e instanceof PaymentRequiredError) throw new Error("Créditos de IA esgotados.");
      throw new Error("O assistente não respondeu. Tente novamente.");
    }
    let raw: unknown;
    try {
      const m = txt.match(/\{[\s\S]*\}/);
      raw = JSON.parse(m ? m[0] : txt);
    } catch {
      throw new Error("Não entendi o pedido. Tente descrever de outro jeito.");
    }
    const list = z.object({ widgets: z.array(z.unknown()) }).safeParse(raw);
    if (!list.success) throw new Error("Resposta inválida do assistente.");

    const out: SugestaoWidget[] = [];
    let x = 0, y = 0, rowH = 0;
    for (const item of list.data.widgets.slice(0, 12)) {
      const p = Sug.safeParse(item);
      if (!p.success) continue;
      const s = p.data;
      const src = getSource(s.fonte);
      if (!src) continue;
      const config: SugestaoWidget["config"] = {};
      if (src.needsTag) { if (!s.tag_nome || !tagSet.has(s.tag_nome)) continue; config.tag_nome = s.tag_nome; }
      if (src.needsMultiTag) {
        const ns = (s.tag_nomes ?? []).filter((n) => tagSet.has(n));
        if (!ns.length) continue; config.tag_nomes = ns;
      }
      if (src.needsEquipamento) { if (!s.equipamento_id || !equipSet.has(s.equipamento_id)) continue; config.equipamento_id = s.equipamento_id; }
      if (src.needsTank) { if (!s.tank_id || !tankSet.has(s.tank_id)) continue; config.tank_id = s.tank_id; }
      if (s.meta != null) config.meta = s.meta;
      if (s.min != null) config.min = s.min;
      if (s.max != null) config.max = s.max;
      const w = Math.max(2, Math.min(12, Math.round(s.w ?? src.colSpan ?? 4)));
      const h = Math.max(1, Math.min(6, Math.round(s.h ?? src.rowSpan ?? 2)));
      if (x + w > 12) { x = 0; y += rowH; rowH = 0; }
      out.push({ fonte: src.key, tipo: src.tipo, titulo: s.titulo || src.label, config, layout: { x, y, w, h } });
      x += w; rowH = Math.max(rowH, h);
    }
    if (!out.length) throw new Error("Não consegui montar cards com os dados disponíveis. Cite tags ou equipamentos pelo nome.");
    return { widgets: out };
  });
