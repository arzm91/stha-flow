import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  pergunta: z.string().trim().min(2).max(500),
});

type Ctx = Record<string, unknown>;

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Assistente de busca do sistema: reúne um contexto compacto do backend
 * (tags ao vivo, produção, alertas, ordens) e pede ao modelo uma resposta curta.
 */
export const askAssistente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Assistente indisponível: chave de IA não configurada.");

    const words = norm(data.pergunta);
    const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();

    const [tagsRes, ordensRes, alertasRes, produtosRes, equipRes] = await Promise.all([
      supabase
        .from("tags_live")
        .select("nome,nome_amigavel,grupo,unidade,valor,valor_num,qualidade,atualizado_em")
        .order("atualizado_em", { ascending: false })
        .limit(400),
      supabase
        .from("ordens_producao")
        .select("numero,status,equipamento_id,produto_id,qtd_planejada,qtd_produzida,inicio_em,fim_em,created_at")
        .gte("created_at", since30)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("alertas_disparos")
        .select("status,criado_em,mensagem")
        .order("criado_em", { ascending: false })
        .limit(20),
      supabase.from("produtos").select("id,nome,unidade").limit(300),
      supabase.from("equipamentos").select("id,nome").limit(100),
    ]);

    const produtos = new Map((produtosRes.data ?? []).map((p) => [p.id, p]));
    const equipamentos = new Map((equipRes.data ?? []).map((e) => [e.id, e.nome]));

    // Tags mais relevantes para a pergunta
    const allTags = tagsRes.data ?? [];
    const scored = allTags.map((t) => {
      const hay = norm(`${t.nome_amigavel ?? ""} ${t.nome} ${t.grupo ?? ""}`);
      const score = words.reduce(
        (acc, w) => acc + (hay.some((h) => h.includes(w) || w.includes(h)) ? 1 : 0),
        0,
      );
      return { t, score };
    });
    const relevantes = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map((s) => s.t);
    const tagsCtx = (relevantes.length > 0 ? relevantes : allTags.slice(0, 40)).map((t) => ({
      nome: t.nome_amigavel || t.nome,
      grupo: t.grupo,
      valor: t.valor_num ?? t.valor,
      unidade: t.unidade,
      qualidade: t.qualidade,
      atualizado_em: t.atualizado_em,
    }));

    const ordens = ordensRes.data ?? [];
    const ordensCtx = ordens.slice(0, 40).map((o) => ({
      op: o.numero,
      status: o.status,
      equipamento: equipamentos.get(o.equipamento_id) ?? null,
      produto: o.produto_id ? (produtos.get(o.produto_id)?.nome ?? null) : null,
      unidade: o.produto_id ? (produtos.get(o.produto_id)?.unidade ?? null) : null,
      planejada: o.qtd_planejada,
      produzida: o.qtd_produzida,
      inicio: o.inicio_em,
      fim: o.fim_em,
    }));

    const somaPeriodo = (desde: string) => {
      const porProduto = new Map<string, number>();
      let total = 0;
      for (const o of ordens) {
        const ref = o.fim_em ?? o.inicio_em ?? o.created_at;
        if (!ref || ref < desde) continue;
        const q = Number(o.qtd_produzida ?? 0);
        if (!q) continue;
        total += q;
        const nome = o.produto_id ? (produtos.get(o.produto_id)?.nome ?? "—") : "—";
        porProduto.set(nome, (porProduto.get(nome) ?? 0) + q);
      }
      return {
        total,
        por_produto: Object.fromEntries([...porProduto.entries()].sort((a, b) => b[1] - a[1])),
      };
    };

    const ctx: Ctx = {
      agora: new Date().toISOString(),
      tags_ao_vivo: tagsCtx,
      producao_ultimos_7_dias: somaPeriodo(since7),
      producao_ultimos_30_dias: somaPeriodo(since30),
      ordens_recentes: ordensCtx,
      alertas_recentes: (alertasRes.data ?? []).map((a) => ({
        status: a.status,
        quando: a.criado_em,
        mensagem: a.mensagem,
      })),
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é o assistente de busca de um sistema industrial (produção, tags, estoque, alertas). " +
              "Responda SEMPRE em português do Brasil, de forma curta e direta (no máximo 5 linhas ou uma lista curta). " +
              "Use apenas os DADOS fornecidos; se a informação não estiver nos dados, diga que não encontrou e sugira onde procurar no sistema. " +
              "Sempre cite valores com unidade e o horário da última atualização quando for uma tag.",
          },
          {
            role: "user",
            content: `Pergunta: ${data.pergunta}\n\nDADOS DO SISTEMA (JSON):\n${JSON.stringify(ctx)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Muitas perguntas em sequência. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      throw new Error(`Falha no assistente (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const resposta = json.choices?.[0]?.message?.content?.trim();
    return {
      resposta: resposta || "Não consegui gerar uma resposta agora. Tente reformular a pergunta.",
    };
  });
