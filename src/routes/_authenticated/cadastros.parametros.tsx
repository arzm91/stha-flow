import { createFileRoute } from "@tanstack/react-router";
import { CrudTable } from "@/components/CrudTable";

export const Route = createFileRoute("/_authenticated/cadastros/parametros")({
  component: () => (
    <CrudTable
      table="parametros_cadastro"
      title="Parâmetros"
      description="Cadastro de parâmetros de processo (temperatura, pressão, vazão, etc)."
      initialValues={{ nome: "", unidade: "", valor_min: "", valor_max: "" }}
      searchKeys={["nome", "unidade"]}
      fields={[
        { key: "nome", label: "Nome do parâmetro", required: true },
        { key: "unidade", label: "Unidade" },
        { key: "valor_min", label: "Valor mínimo", type: "number", step: "any" },
        { key: "valor_max", label: "Valor máximo", type: "number", step: "any" },
      ]}
      columns={[
        { key: "nome", label: "Nome" },
        { key: "unidade", label: "Unidade" },
        { key: "valor_min", label: "Mín." },
        { key: "valor_max", label: "Máx." },
      ]}
    />
  ),
});
