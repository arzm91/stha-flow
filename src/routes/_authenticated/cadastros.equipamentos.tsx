import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CrudTable, type FieldDef } from "@/components/CrudTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, ListChecks, Workflow } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cadastros/equipamentos")({
  head: pageHead({ title: "Cadastros · Equipamentos — STHApc", description: "Acesse e gerencie Cadastros · Equipamentos no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: "/cadastros/equipamentos" }),
  component: EquipamentosPage,
});

function EquipamentosPage() {
  const tags = useQuery({
    queryKey: ["tags_live", "select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live")
        .select("nome,nome_amigavel,unidade,grupo,valor")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const tagOptions = (tags.data ?? []).map((t) => ({
    value: t.nome,
    label: t.nome_amigavel?.trim() || t.nome,
    hint: [
      t.nome_amigavel?.trim() ? t.nome : null,
      t.grupo,
      t.unidade,
      t.valor != null ? `${t.valor}${t.unidade ? " " + t.unidade : ""}` : null,
    ].filter(Boolean).join(" · "),
  }));

  const utilidades = useQuery({
    queryKey: ["equipamentos", "utilidades-opts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("id,codigo,nome,localizacao,tipo")
        .eq("categoria", "utilidade")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const utilidadeOptions = (utilidades.data ?? []).map((u) => ({
    value: u.id,
    label: `${u.codigo} — ${u.nome}`,
    hint: [u.tipo, u.localizacao].filter(Boolean).join(" · "),
  }));

  const fields: FieldDef[] = [
    { key: "codigo", label: "Código", required: true },
    { key: "nome", label: "Nome", required: true },
    { key: "descricao", label: "Descrição", type: "textarea" },
    { key: "tipo", label: "Tipo" },
    { key: "localizacao", label: "Localização" },
    { key: "status", label: "Status", type: "select", required: true, options: [
      { value: "disponivel", label: "Disponível" },
      { value: "ocupado", label: "Ocupado" },
      { value: "parado", label: "Parado" },
    ]},
    {
      key: "tag_nomes",
      label: "Tags associadas",
      type: "multiselect",
      options: tagOptions,
      placeholder: "Pesquise por nome, grupo ou unidade...",
      help: tags.isLoading
        ? "Carregando tags ao vivo..."
        : `${tagOptions.length} tag(s) disponíveis em Tags Ao Vivo.`,
    },
    {
      key: "utilidade_ids",
      label: "Utilidades vinculadas",
      type: "multiselect",
      options: utilidadeOptions,
      placeholder: "Pesquise por código ou nome da utilidade...",
      help: utilidades.isLoading
        ? "Carregando utilidades..."
        : `${utilidadeOptions.length} utilidade(s) cadastradas. Aparecerão no acompanhamento da produção.`,
    },
    { key: "tag_velocidade_producao", label: "Tag de velocidade de produção (opcional)", type: "select",
      options: [{ value: "", label: "— nenhuma —" }, ...tagOptions],
      help: "Tag exibida como velocidade instantânea no acompanhamento.",
    },
    { key: "tag_producao_total", label: "Tag de produção total (opcional)", type: "select",
      options: [{ value: "", label: "— nenhuma —" }, ...tagOptions],
      help: "Tag usada para calcular o % de avanço vs. a quantidade planejada.",
    },
    { key: "capacidade_hora", label: "Capacidade nominal por hora", type: "number", help: "Produção máxima esperada em 1 hora de operação." },
    { key: "capacidade_dia", label: "Capacidade nominal por dia", type: "number", help: "Produção máxima esperada em 24 horas." },
    { key: "capacidade_mes", label: "Capacidade nominal por mês", type: "number", help: "Produção máxima esperada em 30 dias." },
    { key: "capacidade_unidade", label: "Unidade da capacidade", placeholder: "kg, L, un, ..." },

    // ===== Rendimento / Eficiência / Índice =====
    {
      key: "tag_indices",
      label: "Tags de rendimento / eficiência / índice",
      type: "multiselect",
      options: tagOptions,
      placeholder: "Pesquise por nome, grupo ou unidade...",
      section: "Rendimento / Eficiência / Índice",
      help: "Selecione tags (inclui tags calculadas) para exibir como indicadores de rendimento/eficiência/índice nos cards do dashboard, da página de produção e no acompanhamento da produção. Opcional.",
    },

    // ===== Gestão de paradas =====
    { key: "parada_tag_nome", label: "Tag de parada (opcional)", type: "select", section: "Gestão de paradas",
      options: [{ value: "", label: "— nenhuma (não monitorar paradas) —" }, ...tagOptions],
      help: "Quando esta tag atender à condição definida abaixo, o sistema abrirá automaticamente um registro de parada.",
    },
    { key: "parada_modo", label: "Modo de detecção", type: "select",
      options: [
        { value: "", label: "— selecione —" },
        { value: "valor", label: "Valor específico (=, <, >, ≤, ≥)" },
        { value: "faixa", label: "Fora da faixa normal (mín/máx)" },
        { value: "velocidade_zero", label: "Velocidade abaixo de X (parada por inatividade)" },
      ],
      help: "Como o sistema interpreta que o equipamento parou.",
    },
    { key: "parada_operador", label: "Operador (modo Valor específico)", type: "select",
      options: [
        { value: "", label: "— selecione —" },
        { value: "=",  label: "= igual" },
        { value: "<",  label: "< menor que" },
        { value: ">",  label: "> maior que" },
        { value: "<=", label: "≤ menor ou igual" },
        { value: ">=", label: "≥ maior ou igual" },
      ],
    },
    { key: "parada_valor", label: "Valor de referência", type: "number", step: "any",
      help: "Usado nos modos Valor específico e Velocidade abaixo de X.",
    },
    { key: "parada_valor_min", label: "Mínimo da faixa normal", type: "number", step: "any" },
    { key: "parada_valor_max", label: "Máximo da faixa normal", type: "number", step: "any" },
    { key: "parada_tempo_min_seg", label: "Tempo mínimo para confirmar parada (segundos)", type: "number",
      help: "Evita disparo em oscilações curtas. Padrão: 15 segundos.",
    },
    { key: "parada_alerta_apos_min", label: "Alertar supervisor após (minutos)", type: "number",
      help: "Dispara alerta se a parada exceder esse tempo. Deixe vazio para não alertar.",
    },
    { key: "parada_motivos", label: "Motivos disponíveis para este equipamento", type: "chips",
      placeholder: "Ex.: Troca de rolo",
      help: "Lista que aparece no popup ao operador. Os motivos-padrão são preenchidos automaticamente ao criar; personalize por equipamento.",
    },

    { key: "ativo", label: "Ativo", type: "checkbox", section: "Estado" },
  ];

  return (

    <CrudTable
      table="equipamentos"
      resourceType="equipamento"
      title="Equipamentos"
      description="Cadastro e gestão dos equipamentos de produção da planta."
      searchKeys={["nome", "codigo", "tipo", "localizacao"]}
      filter={{ categoria: "producao" }}
      initialValues={{ codigo: "", nome: "", descricao: "", tipo: "", localizacao: "", status: "disponivel", ativo: true, tag_nomes: [], utilidade_ids: [], tag_velocidade_producao: "", tag_producao_total: "", tag_indices: [], capacidade_hora: "", capacidade_dia: "", capacidade_mes: "", capacidade_unidade: "", parada_tag_nome: "", parada_modo: "", parada_operador: "", parada_valor: "", parada_valor_min: "", parada_valor_max: "", parada_tempo_min_seg: 15, parada_alerta_apos_min: "", parada_motivos: ["Falta de energia","Parada programada","Parada não programada","Manutenção","Setup / Troca de produto","Falta de matéria-prima","Falha operacional","Outro"] }}
      fields={fields}


      columns={[
        { key: "codigo", label: "Código" },
        { key: "nome", label: "Nome" },
        { key: "tipo", label: "Tipo" },
        { key: "localizacao", label: "Localização" },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
        { key: "tag_nomes", label: "Tags", render: (r) => {
          const list = Array.isArray(r.tag_nomes) ? (r.tag_nomes as string[]) : [];
          if (list.length === 0) return <span className="text-muted-foreground">—</span>;
          const shown = list.slice(0, 3);
          return (
            <div className="flex flex-wrap gap-1">
              {shown.map((t) => <Badge key={t} variant="outline" className="font-mono text-[10px]">{t}</Badge>)}
              {list.length > shown.length ? <span className="text-xs text-muted-foreground">+{list.length - shown.length}</span> : null}
            </div>
          );
        }},
        { key: "ativo", label: "Ativo", render: (r) => (r.ativo ? "Sim" : "Não") },
      ]}
      extraActions={(r) => (
        <>
          <Button asChild variant="ghost" size="icon" title="Processos (atividades)">
            <Link to="/cadastros/equipamentos-atividades/$id" params={{ id: r.id }}><ListChecks className="h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="ghost" size="icon" title="Diagrama PFD">
            <Link to="/cadastros/equipamentos-pfd/$id" params={{ id: r.id }}><Workflow className="h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="ghost" size="icon" title="Histórico">
            <Link to="/cadastros/equipamentos/$id" params={{ id: r.id }}><History className="h-4 w-4" /></Link>
          </Button>
        </>
      )}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    disponivel: { label: "Disponível", cls: "bg-success/20 text-success border-success/30" },
    ocupado: { label: "Ocupado", cls: "bg-primary/20 text-primary border-primary/30" },
    parado: { label: "Parado", cls: "bg-warning/20 text-warning border-warning/30" },
  };
  const v = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
}
