import { createFileRoute } from "@tanstack/react-router";
import { CrudTable } from "@/components/CrudTable";

export const Route = createFileRoute("/_authenticated/cadastros/produtos")({
  component: () => (
    <CrudTable
      table="produtos"
      title="Produtos"
      description="Cadastro de produtos da operação."
      initialValues={{ codigo: "", nome: "", descricao: "", unidade: "", categoria: "", ativo: true }}
      searchKeys={["nome", "codigo", "categoria"]}
      fields={[
        { key: "codigo", label: "Código", required: true },
        { key: "nome", label: "Nome", required: true },
        { key: "descricao", label: "Descrição", type: "textarea" },
        { key: "unidade", label: "Unidade", required: true, placeholder: "kg, L, un..." },
        { key: "categoria", label: "Categoria" },
        { key: "ativo", label: "Ativo", type: "checkbox" },
      ]}
      columns={[
        { key: "codigo", label: "Código" },
        { key: "nome", label: "Nome" },
        { key: "unidade", label: "Unidade" },
        { key: "categoria", label: "Categoria" },
        { key: "ativo", label: "Ativo", render: (r) => (r.ativo ? "Sim" : "Não") },
      ]}
    />
  ),
});
