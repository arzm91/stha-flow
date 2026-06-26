import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CrudTable, type FieldDef } from "@/components/CrudTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, Workflow } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cadastros/equipamentos")({
  component: EquipamentosPage,
});

function EquipamentosPage() {
  const tags = useQuery({
    queryKey: ["tags_live", "select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live")
        .select("nome,unidade,grupo,valor")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const tagOptions = (tags.data ?? []).map((t) => ({
    value: t.nome,
    label: t.nome,
    hint: [t.grupo, t.unidade, t.valor != null ? `${t.valor}${t.unidade ? " " + t.unidade : ""}` : null]
      .filter(Boolean).join(" · "),
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
    { key: "ativo", label: "Ativo", type: "checkbox" },
  ];

  return (
    <CrudTable
      table="equipamentos"
      title="Equipamentos"
      description="Cadastro e gestão dos equipamentos da planta."
      searchKeys={["nome", "codigo", "tipo", "localizacao"]}
      initialValues={{ codigo: "", nome: "", descricao: "", tipo: "", localizacao: "", status: "disponivel", ativo: true, tag_nomes: [] }}
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
          <Button asChild variant="ghost" size="icon" title="Diagrama PFD">
            <Link to="/cadastros/equipamentos/$id/pfd" params={{ id: r.id }}><Workflow className="h-4 w-4" /></Link>
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
