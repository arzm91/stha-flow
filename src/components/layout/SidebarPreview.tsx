// Prévia exibida ao passar o mouse sobre um item do menu lateral.
// Consulta os dados sob demanda (só quando o hover abre) e oferece
// atalhos clicáveis para os itens recentes de cada módulo.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";

type PreviewItem = { id: string; title: string; subtitle?: string; to: string; params?: Record<string, string> };

async function loadPreview(pageKey: string): Promise<{ heading: string; items: PreviewItem[] }> {
  switch (pageKey) {
    case "tabelas": {
      const { data } = await supabase
        .from("custom_sheets")
        .select("id, nome, updated_at")
        .order("updated_at", { ascending: false })
        .limit(5);
      return {
        heading: "Tabelas recentes",
        items: (data ?? []).map((t) => ({
          id: t.id,
          title: t.nome,
          subtitle: new Date(t.updated_at).toLocaleDateString("pt-BR"),
          to: "/tabelas/$id",
          params: { id: t.id },
        })),
      };
    }
    case "alertas": {
      const { data } = await supabase
        .from("alertas_disparos")
        .select("id, alerta_nome, severidade, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      return {
        heading: "Últimos alertas",
        items: (data ?? []).map((a) => ({
          id: a.id,
          title: a.alerta_nome ?? "Alerta",
          subtitle: `${a.severidade ?? "info"} · ${new Date(a.created_at).toLocaleString("pt-BR")}`,
          to: "/alertas",
        })),
      };
    }
    case "producao": {
      const { data } = await supabase
        .from("ordens_producao")
        .select("id, numero, status, produto:produto_id(nome)")
        .in("status", ["em_andamento", "programada"])
        .order("updated_at", { ascending: false })
        .limit(5);
      return {
        heading: "Ordens em andamento / programadas",
        items: (data ?? []).map((o) => ({
          id: o.id,
          title: `OP ${o.numero}`,
          subtitle: `${(o.produto as { nome?: string } | null)?.nome ?? ""} · ${o.status}`,
          to: "/producao/$id",
          params: { id: o.id },
        })),
      };
    }
    case "estoque": {
      const { data } = await supabase
        .from("movimentacoes_estoque")
        .select("id, tipo, quantidade, created_at, produto:produto_id(nome)")
        .order("created_at", { ascending: false })
        .limit(5);
      return {
        heading: "Últimas movimentações",
        items: (data ?? []).map((m) => ({
          id: m.id,
          title: `${m.tipo} · ${m.quantidade}`,
          subtitle: `${(m.produto as { nome?: string } | null)?.nome ?? ""} · ${new Date(m.created_at).toLocaleString("pt-BR")}`,
          to: "/estoque/movimentacao",
        })),
      };
    }
    case "tags": {
      const { data } = await supabase
        .from("tags_live")
        .select("nome, nome_amigavel, valor, unidade, atualizado_em")
        .order("atualizado_em", { ascending: false })
        .limit(5);
      return {
        heading: "Tags atualizadas agora",
        items: (data ?? []).map((t) => ({
          id: t.nome,
          title: t.nome_amigavel ?? t.nome,
          subtitle: `${t.valor ?? "—"} ${t.unidade ?? ""}`.trim(),
          to: "/tags",
        })),
      };
    }
    case "automacoes": {
      const { data } = await supabase
        .from("automation_flows")
        .select("id, nome, ativo, last_triggered_at")
        .order("updated_at", { ascending: false })
        .limit(5);
      return {
        heading: "Automações",
        items: (data ?? []).map((f) => ({
          id: f.id,
          title: f.nome,
          subtitle: f.ativo
            ? `ativa${f.last_triggered_at ? ` · disparou ${new Date(f.last_triggered_at).toLocaleString("pt-BR")}` : ""}`
            : "desativada",
          to: "/automacoes/$id",
          params: { id: f.id },
        })),
      };
    }
    case "turnos": {
      const { data } = await supabase
        .from("relatorio_turno_eventos")
        .select("id, categoria, titulo, descricao, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      return {
        heading: "Últimos eventos de turno",
        items: (data ?? []).map((e) => ({
          id: e.id,
          title: (e.titulo ?? e.descricao ?? "").slice(0, 60) || e.categoria,
          subtitle: `${e.categoria} · ${new Date(e.created_at).toLocaleString("pt-BR")}`,
          to: "/turnos",
        })),
      };
    }
    case "manutencao": {
      const { data } = await supabase
        .from("ordens_manutencao")
        .select("id, numero, descricao_problema, status")
        .order("created_at", { ascending: false })
        .limit(5);
      return {
        heading: "Ordens de manutenção recentes",
        items: (data ?? []).map((o) => ({
          id: o.id,
          title: `OS ${o.numero}`,
          subtitle: `${(o.descricao_problema ?? "").slice(0, 40)} · ${o.status}`,
          to: "/manutencao",
        })),
      };
    }
    case "relatorios": {
      const { data } = await supabase
        .from("report_runs")
        .select("id, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      return {
        heading: "Relatórios gerados recentemente",
        items: (data ?? []).map((r) => ({
          id: r.id,
          title: `Relatório · ${r.status}`,
          subtitle: new Date(r.created_at).toLocaleString("pt-BR"),
          to: "/relatorios",
        })),
      };
    }
    case "cadastros": {
      const [eq, prod, tq] = await Promise.all([
        supabase.from("equipamentos").select("id", { count: "exact", head: true }),
        supabase.from("produtos").select("id", { count: "exact", head: true }),
        supabase.from("tanques").select("id", { count: "exact", head: true }),
      ]);
      return {
        heading: "Cadastros",
        items: [
          { id: "eq", title: "Equipamentos", subtitle: `${eq.count ?? 0} cadastrados`, to: "/cadastros/equipamentos" },
          { id: "prod", title: "Produtos", subtitle: `${prod.count ?? 0} cadastrados`, to: "/cadastros/produtos" },
          { id: "tq", title: "Tanques", subtitle: `${tq.count ?? 0} cadastrados`, to: "/cadastros/tanques" },
        ],
      };
    }
    default:
      return { heading: "", items: [] };
  }
}

export function SidebarPreview({ pageKey, title }: { pageKey: string; title: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["sidebar-preview", pageKey],
    queryFn: () => loadPreview(pageKey),
    staleTime: 30_000,
  });

  return (
    <div className="w-64">
      <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">{data?.heading ?? title}</p>
      {isLoading ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">Carregando…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">Nada por aqui ainda.</p>
      ) : (
        <div className="space-y-0.5">
          {data.items.map((it) => (
            <Link
              key={it.id}
              to={it.to as never}
              params={it.params as never}
              className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{it.title}</span>
                {it.subtitle && (
                  <span className="block truncate text-[11px] text-muted-foreground">{it.subtitle}</span>
                )}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
