import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, FileBarChart, Play, Pencil, Trash2 } from "lucide-react";
import { FONTE_LABEL, sourceFor } from "@/lib/relatorios/sources";
import type { Fonte, SourceKey } from "@/lib/relatorios/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relatorios/")({
  component: RelatoriosIndex,
});

type Template = {
  id: string;
  nome: string;
  descricao: string | null;
  fonte: Fonte;
  config: { source: SourceKey } & Record<string, unknown>;
  created_at: string;
};

function RelatoriosIndex() {
  const { isAdmin } = usePagePermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["relatorio_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relatorio_templates")
        .select("id, nome, descricao, fonte, config, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Template[];
    },
  });

  async function remove(id: string) {
    const { error } = await supabase.from("relatorio_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Relatório removido");
    qc.invalidateQueries({ queryKey: ["relatorio_templates"] });
  }

  const groups = { producao: [] as Template[], estoque_qualidade: [] as Template[], manutencao_automacao: [] as Template[] };
  for (const t of q.data ?? []) groups[t.fonte]?.push(t);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Relatórios"
        description="Crie relatórios personalizados com dados do seu sistema."
        actions={isAdmin && (
          <Button onClick={() => navigate({ to: "/relatorios/novo" })}>
            <Plus className="mr-2 h-4 w-4" /> Novo relatório
          </Button>
        )}
      />

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {q.data && q.data.length === 0 && (
        <Card className="p-8 text-center">
          <FileBarChart className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum relatório personalizado ainda.
            {isAdmin ? " Crie o primeiro clicando em \"Novo relatório\"." : " Peça a um administrador para criar."}
          </p>
        </Card>
      )}

      {(["producao", "estoque_qualidade", "manutencao_automacao"] as Fonte[]).map((f) =>
        groups[f].length ? (
          <div key={f}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{FONTE_LABEL[f]}</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {groups[f].map((t) => {
                const src = sourceFor(t.config.source);
                return (
                  <Card key={t.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{t.nome}</div>
                        <div className="truncate text-xs text-muted-foreground">{src?.label ?? ""}</div>
                      </div>
                    </div>
                    {t.descricao && <p className="line-clamp-2 text-xs text-muted-foreground">{t.descricao}</p>}
                    <div className="mt-auto flex items-center gap-2 pt-2">
                      <Button asChild size="sm" variant="default" className="flex-1">
                        <Link to="/relatorios/$id" params={{ id: t.id }}><Play className="mr-1 h-3 w-3" />Abrir</Link>
                      </Button>
                      {isAdmin && (
                        <>
                          <Button asChild size="icon" variant="outline">
                            <Link to="/relatorios/$id" params={{ id: t.id }} search={{ edit: 1 }}><Pencil className="h-3 w-3" /></Link>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="outline"><Trash2 className="h-3 w-3" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
                                <AlertDialogDescription>“{t.nome}” será removido.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(t.id)}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}
