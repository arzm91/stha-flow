import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { PageHeader } from "@/components/PageHeader";
import { ReportBuilder } from "@/components/relatorios/ReportBuilder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { Fonte, ReportConfig, SourceKey } from "@/lib/relatorios/types";

export const Route = createFileRoute("/_authenticated/relatorios/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ edit: s.edit === 1 || s.edit === "1" ? 1 : undefined }) as { edit?: 1 },
  component: RelatorioDetalhe,
});


function RelatorioDetalhe() {
  const { id } = Route.useParams();
  const { edit } = Route.useSearch();
  const navigate = useNavigate();
  const { isAdmin } = usePagePermissions();

  const q = useQuery({
    queryKey: ["relatorio_template", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relatorio_templates")
        .select("id, nome, descricao, fonte, config")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (q.isLoading) return <div className="p-4 text-sm text-muted-foreground">Carregando…</div>;
  if (!q.data) return (
    <Card className="p-6">
      <p className="text-sm text-muted-foreground">Relatório não encontrado.</p>
      <Button asChild className="mt-3" variant="outline"><Link to="/relatorios">Voltar</Link></Button>
    </Card>
  );

  const editing = !!edit && isAdmin;

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader
          title={q.data.nome}
          description={q.data.descricao ?? undefined}
          actions={
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm"><Link to="/relatorios"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link></Button>
              {isAdmin && !editing && (
                <Button variant="outline" size="sm" onClick={() => navigate({ to: "/relatorios/$id", params: { id }, search: { edit: 1 } })}>
                  Editar
                </Button>
              )}
            </div>
          }
        />
      </div>

      <ReportBuilder
        mode={editing ? "edit" : "run"}
        canEdit={editing}
        initialName={q.data.nome}
        initialDescription={q.data.descricao ?? ""}
        initialFonte={q.data.fonte as Fonte}
        initialSource={(q.data.config as unknown as ReportConfig).source as SourceKey}
        initialConfig={q.data.config as unknown as ReportConfig}
        onSave={editing ? async ({ nome, descricao, fonte, config }) => {
          const { error } = await supabase
            .from("relatorio_templates")
            .update({ nome, descricao: descricao || null, fonte, config })
            .eq("id", id);
          if (error) return toast.error(error.message);
          toast.success("Relatório atualizado");
          navigate({ to: "/relatorios/$id", params: { id }, search: {} });
        } : undefined}
      />
    </div>
  );
}
