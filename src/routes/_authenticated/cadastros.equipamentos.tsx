import { createFileRoute, Link } from "@tanstack/react-router";
import { CrudTable } from "@/components/CrudTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cadastros/equipamentos")({
  component: () => (
    <CrudTable
      table="equipamentos"
      title="Equipamentos"
      description="Cadastro e gestão dos equipamentos da planta."
      searchKeys={["nome", "codigo", "tipo", "localizacao"]}
      initialValues={{ codigo: "", nome: "", descricao: "", tipo: "", localizacao: "", status: "disponivel", ativo: true }}
      fields={[
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
        { key: "ativo", label: "Ativo", type: "checkbox" },
      ]}
      columns={[
        { key: "codigo", label: "Código" },
        { key: "nome", label: "Nome" },
        { key: "tipo", label: "Tipo" },
        { key: "localizacao", label: "Localização" },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status as string} /> },
        { key: "ativo", label: "Ativo", render: (r) => (r.ativo ? "Sim" : "Não") },
      ]}
      extraActions={(r) => (
        <Button asChild variant="ghost" size="icon" title="Histórico">
          <Link to="/cadastros/equipamentos/$id" params={{ id: r.id }}><History className="h-4 w-4" /></Link>
        </Button>
      )}
    />
  ),
});

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    disponivel: { label: "Disponível", cls: "bg-success/20 text-success border-success/30" },
    ocupado: { label: "Ocupado", cls: "bg-primary/20 text-primary border-primary/30" },
    parado: { label: "Parado", cls: "bg-warning/20 text-warning border-warning/30" },
  };
  const v = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
}
