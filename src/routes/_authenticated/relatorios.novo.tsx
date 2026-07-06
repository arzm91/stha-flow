import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { PageHeader } from "@/components/PageHeader";
import { ReportBuilder } from "@/components/relatorios/ReportBuilder";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/relatorios/novo")({
  component: NovoRelatorio,
});

function NovoRelatorio() {
  const { isAdmin, loading } = usePagePermissions();
  const navigate = useNavigate();

  if (loading) return null;
  if (!isAdmin) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Apenas administradores podem criar relatórios personalizados.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Novo relatório" description="Escolha a fonte de dados, colunas e filtros. Você poderá salvar e reutilizar depois." />
      <ReportBuilder
        mode="create"
        canEdit
        onSave={async ({ nome, descricao, fonte, config }) => {
          const { data: u } = await supabase.auth.getUser();
          if (!u.user) { toast.error("Sessão inválida"); return; }
          const { data, error } = await supabase
            .from("relatorio_templates")
            .insert({ nome, descricao: descricao || null, fonte, config, created_by: u.user.id })
            .select("id")
            .single();
          if (error) { toast.error(error.message); return; }
          toast.success("Relatório salvo");
          navigate({ to: "/relatorios/$id", params: { id: data.id } });
        }}
      />
    </div>
  );
}
