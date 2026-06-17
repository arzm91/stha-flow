import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { Tag as TagIcon, Radio, Settings } from "lucide-react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tags/")({
  component: TagsPage,
});

type TagRow = {
  nome: string;
  valor: string | null;
  valor_num: number | null;
  unidade: string | null;
  grupo: string | null;
  qualidade: string | null;
  atualizado_em: string;
};

function TagsPage() {
  const [filtro, setFiltro] = useState("");

  const tags = useQuery({
    queryKey: ["tags-live"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live" as never)
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as TagRow[];
    },
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
  });

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return tags.data ?? [];
    return (tags.data ?? []).filter(
      (t) =>
        t.nome.toLowerCase().includes(q) ||
        (t.grupo ?? "").toLowerCase().includes(q) ||
        (t.valor ?? "").toLowerCase().includes(q),
    );
  }, [tags.data, filtro]);

  const grupos = useMemo(() => {
    const set = new Set<string>();
    for (const t of tags.data ?? []) if (t.grupo) set.add(t.grupo);
    return Array.from(set);
  }, [tags.data]);

  return (
    <div>
      <PageHeader
        title="Tags em Tempo Real"
        description="Valores atuais recebidos via API. Atualização automática a cada 1s."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Ao vivo
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/tags/endpoints">
                <Settings className="mr-1 h-4 w-4" /> Endpoints
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Tags ativas</div>
            <div className="text-2xl font-semibold">{tags.data?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Grupos</div>
            <div className="text-2xl font-semibold">{grupos.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Última atualização</div>
            <div className="text-sm font-medium">
              {tags.data && tags.data.length > 0
                ? formatDate(
                    tags.data.reduce((a, b) => (a.atualizado_em > b.atualizado_em ? a : b))
                      .atualizado_em,
                  )
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3">
        <Input
          placeholder="Filtrar por nome, grupo ou valor…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="max-w-md"
        />
      </div>

      {(tags.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Radio className="h-6 w-6" />}
          title="Aguardando tags"
          description="Nenhuma tag recebida ainda. Envie um POST para /api/public/tags para começar."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Qualidade</TableHead>
                  <TableHead>Atualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((t) => (
                  <TableRow key={t.nome}>
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <TagIcon className="h-3 w-3 text-muted-foreground" />
                        {t.nome}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.grupo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-base font-semibold text-primary">
                      {t.valor_num !== null
                        ? t.valor_num.toLocaleString("pt-BR", { maximumFractionDigits: 4 })
                        : (t.valor ?? "—")}
                    </TableCell>
                    <TableCell className="text-sm">{t.unidade ?? "—"}</TableCell>
                    <TableCell>
                      <QualityBadge q={t.qualidade} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(t.atualizado_em)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QualityBadge({ q }: { q: string | null }) {
  if (!q) return <span className="text-xs text-muted-foreground">—</span>;
  const v = q.toLowerCase();
  const cls =
    v === "good" || v === "boa" || v === "ok"
      ? "bg-success/20 text-success border-success/30"
      : v === "bad" || v === "ruim" || v === "erro"
        ? "bg-destructive/20 text-destructive border-destructive/30"
        : "bg-warning/20 text-warning border-warning/30";
  return (
    <Badge variant="outline" className={cls}>
      {q}
    </Badge>
  );
}
