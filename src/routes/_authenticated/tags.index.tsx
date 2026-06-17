import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { Tag as TagIcon, Radio, Settings, Pencil, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tags/")({
  component: TagsPage,
});

type TagRow = {
  nome: string;
  nome_amigavel: string | null;
  valor: string | null;
  valor_num: number | null;
  unidade: string | null;
  grupo: string | null;
  qualidade: string | null;
  valor_min: number | null;
  valor_max: number | null;
  atualizado_em: string;
};

function outOfRange(t: TagRow) {
  if (t.valor_num === null) return false;
  if (t.valor_min !== null && t.valor_num < t.valor_min) return "low";
  if (t.valor_max !== null && t.valor_num > t.valor_max) return "high";
  return false;
}

function TagsPage() {
  const [filtro, setFiltro] = useState("");
  const [editando, setEditando] = useState<TagRow | null>(null);

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
        (t.nome_amigavel ?? "").toLowerCase().includes(q) ||
        (t.grupo ?? "").toLowerCase().includes(q) ||
        (t.valor ?? "").toLowerCase().includes(q),
    );
  }, [tags.data, filtro]);

  const grupos = useMemo(() => {
    const set = new Set<string>();
    for (const t of tags.data ?? []) if (t.grupo) set.add(t.grupo);
    return Array.from(set);
  }, [tags.data]);

  const alertas = useMemo(
    () => (tags.data ?? []).filter((t) => outOfRange(t)).length,
    [tags.data],
  );

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

      <div className="mb-3 grid gap-3 sm:grid-cols-4">
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
            <div className="text-xs text-muted-foreground">Fora dos limites</div>
            <div
              className={`text-2xl font-semibold ${alertas > 0 ? "text-destructive" : ""}`}
            >
              {alertas}
            </div>
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
                  <TableHead className="text-right">Mín</TableHead>
                  <TableHead className="text-right">Máx</TableHead>
                  <TableHead>Qualidade</TableHead>
                  <TableHead>Atualizado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((t) => {
                  const fora = outOfRange(t);
                  return (
                    <TableRow key={t.nome} className={fora ? "bg-destructive/5" : undefined}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <TagIcon className="h-3 w-3 text-muted-foreground" />
                          <div className="flex flex-col">
                            {t.nome_amigavel ? (
                              <>
                                <span className="font-medium">{t.nome_amigavel}</span>
                                <span className="font-mono text-[10px] text-muted-foreground">{t.nome}</span>
                              </>
                            ) : (
                              <span className="font-mono">{t.nome}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.grupo ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-base font-semibold ${
                          fora ? "text-destructive" : "text-primary"
                        }`}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {fora && <AlertTriangle className="h-3 w-3" />}
                          {t.valor_num !== null
                            ? t.valor_num.toLocaleString("pt-BR", { maximumFractionDigits: 4 })
                            : (t.valor ?? "—")}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{t.unidade ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {t.valor_min ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {t.valor_max ?? "—"}
                      </TableCell>
                      <TableCell>
                        <QualityBadge q={t.qualidade} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(t.atualizado_em)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditando(t)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <EditTagDialog tag={editando} onClose={() => setEditando(null)} />
    </div>
  );
}

function EditTagDialog({ tag, onClose }: { tag: TagRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [nomeAmigavel, setNomeAmigavel] = useState("");
  const [unidade, setUnidade] = useState("");
  const [grupo, setGrupo] = useState("");
  const [vMin, setVMin] = useState("");
  const [vMax, setVMax] = useState("");

  useMemo(() => {
    if (tag) {
      setNomeAmigavel(tag.nome_amigavel ?? "");
      setUnidade(tag.unidade ?? "");
      setGrupo(tag.grupo ?? "");
      setVMin(tag.valor_min !== null ? String(tag.valor_min) : "");
      setVMax(tag.valor_max !== null ? String(tag.valor_max) : "");
    }
  }, [tag]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tag) return;
      const min = vMin.trim() === "" ? null : Number(vMin);
      const max = vMax.trim() === "" ? null : Number(vMax);
      if (min !== null && Number.isNaN(min)) throw new Error("Mínimo inválido");
      if (max !== null && Number.isNaN(max)) throw new Error("Máximo inválido");
      if (min !== null && max !== null && min > max)
        throw new Error("Mínimo não pode ser maior que máximo");

      const { error } = await supabase
        .from("tags_live" as never)
        .update({
          nome_amigavel: nomeAmigavel.trim() || null,
          unidade: unidade.trim() || null,
          grupo: grupo.trim() || null,
          valor_min: min,
          valor_max: max,
        } as never)
        .eq("nome", tag.nome);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tag atualizada");
      qc.invalidateQueries({ queryKey: ["tags-live"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={!!tag} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{tag?.nome}</DialogTitle>
          <DialogDescription>
            Configure a unidade, grupo e limites operacionais. Esses valores não são sobrescritos
            pela API.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unidade</Label>
              <Input
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="°C, bar, %"
              />
            </div>
            <div>
              <Label>Grupo</Label>
              <Input
                value={grupo}
                onChange={(e) => setGrupo(e.target.value)}
                placeholder="Reator 8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor mínimo</Label>
              <Input
                type="number"
                step="any"
                value={vMin}
                onChange={(e) => setVMin(e.target.value)}
                placeholder="—"
              />
            </div>
            <div>
              <Label>Valor máximo</Label>
              <Input
                type="number"
                step="any"
                value={vMax}
                onChange={(e) => setVMax(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
