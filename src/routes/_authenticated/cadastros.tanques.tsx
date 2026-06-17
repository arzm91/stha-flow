import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CrudTable } from "@/components/CrudTable";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cadastros/tanques")({
  component: TanquesPage,
});

function TanquesPage() {
  const produtos = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id,nome,codigo").order("nome");
      return data ?? [];
    },
  });

  return (
    <CrudTable
      table="tanques"
      title="Tanques"
      description="Cadastro de tanques de armazenamento."
      initialValues={{ codigo: "", nome: "", capacidade: "", unidade: "", produto_id: "" }}
      searchKeys={["nome", "codigo"]}
      fields={[
        { key: "codigo", label: "Código", required: true },
        { key: "nome", label: "Nome", required: true },
        { key: "capacidade", label: "Capacidade", type: "number", step: "any" },
        { key: "unidade", label: "Unidade", placeholder: "L, kg..." },
        { key: "produto_id", label: "Produto armazenado", type: "select",
          options: (produtos.data ?? []).map((p) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` })) },
      ]}
      columns={[
        { key: "codigo", label: "Código" },
        { key: "nome", label: "Nome" },
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
