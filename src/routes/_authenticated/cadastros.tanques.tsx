import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CrudTable } from "@/components/CrudTable";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cadastros/tanques")({
  component: TanquesPage,
});

const TIPO_OPTIONS = [
  { value: "tanque", label: "Tanque (líquido/granel)" },
  { value: "container", label: "Container / IBC / Bombona" },
  { value: "pallet", label: "Pallet" },
  { value: "generico", label: "Local físico genérico" },
];

const MODO_TAG_OPTIONS = [
  { value: "percent", label: "Percentual (0–100%)" },
  { value: "absoluto", label: "Mesma unidade do local" },
];

function TanquesPage() {
  const produtos = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id,nome,codigo").order("nome");
      return data ?? [];
    },
  });
  const tags = useQuery({
    queryKey: ["tags-live-nomes"],
    queryFn: async () => {
      const { data } = await supabase.from("tags_live").select("nome,unidade,grupo").order("nome");
      return data ?? [];
    },
  });

  return (
    <CrudTable
      table="tanques"
      title="Locais de armazenamento"
      description="Tanques, containers, pallets e outros locais físicos de estoque."
      initialValues={{ codigo: "", nome: "", tipo: "tanque", capacidade: "", unidade: "", produto_id: "", tag_nivel_nome: "", tag_nivel_modo: "percent", cor: "" }}
      searchKeys={["nome", "codigo"]}
      fields={[
        { key: "codigo", label: "Código", required: true },
        { key: "nome", label: "Nome", required: true },
        { key: "tipo", label: "Tipo de local", type: "select", required: true, options: TIPO_OPTIONS },
        { key: "capacidade", label: "Capacidade", type: "number", step: "any" },
        { key: "unidade", label: "Unidade", placeholder: "L, kg, un..." },
        { key: "produto_id", label: "Produto armazenado", type: "select",
          options: (produtos.data ?? []).map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` })) },
        { key: "tag_nivel_nome", label: "Tag de nível (opcional)", type: "select",
          options: (tags.data ?? []).map((t) => ({
            value: t.nome,
            label: `${t.nome}${t.unidade ? ` (${t.unidade})` : ""}`,
            hint: t.grupo ?? undefined,
          })),
          help: "Selecione uma tag recebida pelo endpoint. Usada apenas para comparativo visual, não afeta o saldo." },
        { key: "tag_nivel_modo", label: "Como interpretar a tag", type: "select", options: MODO_TAG_OPTIONS },
        { key: "cor", label: "Cor do ícone (opcional)", placeholder: "#3b82f6" },
      ]}
      columns={[
        { key: "codigo", label: "Código" },
        { key: "nome", label: "Nome" },
        { key: "tipo", label: "Tipo", render: (r) => TIPO_OPTIONS.find((t) => t.value === r.tipo)?.label ?? String(r.tipo ?? "—") },
        { key: "capacidade", label: "Capacidade" },
        { key: "unidade", label: "Unidade" },
      ]}
      extraActions={(r) => (
        <Button asChild variant="ghost" size="icon" title="Histórico">
          <Link to="/estoque/tanques/$id" params={{ id: r.id }}><History className="h-4 w-4" /></Link>
        </Button>
      )}
    />
  );
}
