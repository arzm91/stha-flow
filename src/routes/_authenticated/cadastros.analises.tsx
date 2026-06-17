import { createFileRoute } from "@tanstack/react-router";
import { CrudTable } from "@/components/CrudTable";

export const Route = createFileRoute("/_authenticated/cadastros/analises")({
  component: () => (
    <CrudTable
      table="analises_cadastro"
      title="Análises"
      description="Cadastro de análises de qualidade (pH, viscosidade, densidade, etc)."
      initialValues={{ nome: "", unidade: "", valor_min: "", valor_max: "", obrigatoria: false }}
      searchKeys={["nome", "unidade"]}
      fields={[
        { key: "nome", label: "Nome da análise", required: true },
        { key: "unidade", label: "Unidade" },
        { key: "valor_min", label: "Valor mínimo", type: "number", step: "any" },
        { key: "valor_max", label: "Valor máximo", type: "number", step: "any" },
        { key: "obrigatoria", label: "Obrigatória", type: "checkbox" },
      ]}
      columns={[
        { key: "nome", label: "Nome" },
        { key: "unidade", label: "Unidade" },
        { key: "valor_min", label: "Mín." },
        { key: "valor_max", label: "Máx." },
        { key: "obrigatoria", label: "Obrigatória", render: (r) => (r.obrigatoria ? "Sim" : "Não") },
      ]}
    />
  ),
});
