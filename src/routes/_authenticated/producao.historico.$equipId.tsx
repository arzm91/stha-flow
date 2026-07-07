import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, Factory } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, formatNumber, durationBetween, durationFromNow } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/producao/historico/$equipId")({
  head: pageHead({ title: "Produção · Histórico · Detalhes — STHApc", description: "Visualize detalhes no STHApc. Sistema de gestão industrial para produção, estoque, qualidade e manutenção.", path: (params) => `/producao/historico/${params.equipId}` }),
  component: HistoricoEquip,
});

function HistoricoEquip() {
  const { equipId } = Route.useParams();

  const equip = useQuery({
    queryKey: ["equipamento", equipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipamentos")
        .select("id,codigo,nome,tipo,localizacao,status")
        .eq("id", equipId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ops = useQuery({
    queryKey: ["equipamento-ops", equipId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_producao")
        .select("id,numero,status,inicio_em,fim_em,qtd_produzida,qtd_planejada,owner_id,produto:produto_id(nome,codigo,unidade)")
        .eq("equipamento_id", equipId)
        .order("inicio_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const operadores = useQuery({
    queryKey: ["operadores", equipId, (ops.data ?? []).map((o) => o.owner_id).join(",")],
    enabled: (ops.data ?? []).length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set((ops.data ?? []).map((o) => o.owner_id))).filter(Boolean);
      if (ids.length === 0) return [] as { id: string; nome: string }[];
      const { data, error } = await supabase.from("profiles").select("id,nome").in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  const operadorMap = new Map((operadores.data ?? []).map((p) => [p.id, p.nome]));

  const list = ops.data ?? [];
  const finalizadas = list.filter((o) => o.status === "finalizada");
  const totalProduzido = finalizadas.reduce((s, o) => s + Number(o.qtd_produzida ?? 0), 0);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/producao"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar para Produção</Link>
      </Button>

      <PageHeader
        title={`Histórico — ${equip.data?.nome ?? "Equipamento"}`}
        description={equip.data ? `Código ${equip.data.codigo} · ${equip.data.tipo ?? "—"} · ${equip.data.localizacao ?? "—"}` : ""}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiInline label="Total de OPs" value={String(list.length)} />
        <KpiInline label="Finalizadas" value={String(finalizadas.length)} />
        <KpiInline label="Em andamento" value={String(list.length - finalizadas.length)} />
        <KpiInline label="Total produzido" value={formatNumber(totalProduzido)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Produções realizadas</CardTitle></CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <EmptyState
              icon={<Factory className="h-6 w-6" />}
              title="Sem produções registradas"
              description="As ordens de produção feitas neste equipamento aparecerão aqui."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OP</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Qtd. produzida</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((o) => {
                  const prod = o.produto as { nome: string; unidade: string | null } | null;
                  return (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell className="font-mono">{o.numero}</TableCell>
                      <TableCell>{prod?.nome ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                      <TableCell>{o.inicio_em ? formatDate(o.inicio_em) : "—"}</TableCell>
                      <TableCell>{o.fim_em ? formatDate(o.fim_em) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {o.inicio_em ? (o.fim_em ? durationBetween(o.inicio_em, o.fim_em) : durationFromNow(o.inicio_em)) : "—"}
                      </TableCell>
                      <TableCell className="font-mono">
                        {o.qtd_produzida != null ? formatNumber(Number(o.qtd_produzida)) : "—"}
                        {prod?.unidade ? <span className="ml-1 text-xs text-muted-foreground">{prod.unidade}</span> : null}
                      </TableCell>
                      <TableCell className="text-sm">{operadorMap.get(o.owner_id) ?? "—"}</TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/producao/$id" params={{ id: o.id }}>
                            <Eye className="mr-1 h-4 w-4" /> Abrir
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiInline({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    em_andamento: { label: "Em andamento", cls: "bg-primary/20 text-primary border-primary/30" },
    finalizada: { label: "Finalizada", cls: "bg-success/20 text-success border-success/30" },
    cancelada: { label: "Cancelada", cls: "bg-destructive/20 text-destructive border-destructive/30" },
  };
  const v = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
}
