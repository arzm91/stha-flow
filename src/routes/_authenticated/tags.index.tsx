import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import {
  Tag as TagIcon,
  Radio,
  Settings,
  Pencil,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { formatRelative, formatNumber } from "@/lib/format";
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
  origem: string | null;
  atualizado_em: string;
};

const SEM_GRUPO = "Sem grupo";

function outOfRange(t: TagRow): "low" | "high" | false {
  if (t.valor_num === null) return false;
  if (t.valor_min !== null && t.valor_num < t.valor_min) return "low";
  if (t.valor_max !== null && t.valor_num > t.valor_max) return "high";
  return false;
}

function TagsPage() {
  const [filtro, setFiltro] = useState("");
  const [grupoSel, setGrupoSel] = useState<string>("todos");
  const [soAlertas, setSoAlertas] = useState(false);
  const [editando, setEditando] = useState<TagRow | null>(null);
  const [excluindo, setExcluindo] = useState<TagRow | null>(null);
  const [, setTick] = useState(0);

  // re-render a cada 1s para atualizar os "há Xs"
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
    refetchIntervalInBackground: false,
  });

  const grupos = useMemo(() => {
    const set = new Set<string>();
    for (const t of tags.data ?? []) set.add(t.grupo ?? SEM_GRUPO);
    return Array.from(set).sort();
  }, [tags.data]);

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return (tags.data ?? []).filter((t) => {
      if (grupoSel !== "todos" && (t.grupo ?? SEM_GRUPO) !== grupoSel) return false;
      if (soAlertas && !outOfRange(t)) return false;
      if (!q) return true;
      return (
        t.nome.toLowerCase().includes(q) ||
        (t.nome_amigavel ?? "").toLowerCase().includes(q) ||
        (t.grupo ?? "").toLowerCase().includes(q) ||
        (t.valor ?? "").toLowerCase().includes(q)
      );
    });
  }, [tags.data, filtro, grupoSel, soAlertas]);

  const agrupadas = useMemo(() => {
    const map = new Map<string, TagRow[]>();
    for (const t of filtradas) {
      const g = t.grupo ?? SEM_GRUPO;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(t);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtradas]);

  const alertas = useMemo(
    () => (tags.data ?? []).filter((t) => outOfRange(t)).length,
    [tags.data],
  );

  const ultimaAt = useMemo(() => {
    const ts = (tags.data ?? []).map((t) => new Date(t.atualizado_em).getTime());
    return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
  }, [tags.data]);

  return (
    <div>
      <PageHeader
        title="Tags em Tempo Real"
        description="Valores recebidos automaticamente dos endpoints HTTP configurados. Atualização visual a cada 1 segundo."
        actions={
          <>
            <div className="mr-2 flex items-center gap-2 self-center text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Ao vivo
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/tags/endpoints">
                <Settings className="mr-1 h-4 w-4" /> Endpoints HTTP
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiBox label="Tags ativas" value={tags.data?.length ?? 0} />
        <KpiBox label="Grupos" value={grupos.length} />
        <KpiBox
          label="Fora dos limites"
          value={alertas}
          tone={alertas > 0 ? "danger" : "default"}
        />
        <KpiBox label="Última leitura" value={ultimaAt ? formatRelative(ultimaAt) : "—"} small />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nome, grupo ou valor…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="max-w-xs"
        />
        <Select value={grupoSel} onValueChange={setGrupoSel}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os grupos</SelectItem>
            {grupos.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={soAlertas} onCheckedChange={setSoAlertas} />
          Só alertas
        </label>
      </div>

      {(tags.data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={<Radio className="h-6 w-6" />}
              title="Nenhuma tag recebida"
              description="Cadastre um endpoint HTTP para o sistema começar a buscar tags automaticamente."
              action={
                <Button size="sm" asChild>
                  <Link to="/tags/endpoints">
                    <Settings className="mr-1 h-4 w-4" /> Configurar endpoints
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : agrupadas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma tag corresponde aos filtros.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agrupadas.map(([grupo, lista]) => (
            <GrupoCard
              key={grupo}
              grupo={grupo}
              tags={lista}
              onEdit={setEditando}
              onDelete={setExcluindo}
            />
          ))}
        </div>
      )}

      <EditTagDialog tag={editando} onClose={() => setEditando(null)} />
      <DeleteTagDialog tag={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  );
}

function KpiBox({
  label,
  value,
  tone = "default",
  small,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "danger";
  small?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`${small ? "text-base" : "text-2xl"} font-semibold ${
            tone === "danger" ? "text-destructive" : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function GrupoCard({
  grupo,
  tags,
  onEdit,
  onDelete,
}: {
  grupo: string;
  tags: TagRow[];
  onEdit: (t: TagRow) => void;
  onDelete: (t: TagRow) => void;
}) {
  const alertas = tags.filter((t) => outOfRange(t)).length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">{grupo}</CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {alertas > 0 && (
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
              {alertas} alerta{alertas > 1 ? "s" : ""}
            </Badge>
          )}
          <span>
            {tags.length} tag{tags.length > 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {tags.map((t) => (
            <TagItem key={t.nome} tag={t} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TagItem({
  tag: t,
  onEdit,
  onDelete,
}: {
  tag: TagRow;
  onEdit: (t: TagRow) => void;
  onDelete: (t: TagRow) => void;
}) {
  const fora = outOfRange(t);
  return (
    <li
      className={`group flex items-center justify-between gap-2 px-3 py-2 ${
        fora ? "bg-destructive/5" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TagIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          {t.nome_amigavel ? (
            <>
              <div className="truncate text-sm font-medium">{t.nome_amigavel}</div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">{t.nome}</div>
            </>
          ) : (
            <div className="truncate font-mono text-xs">{t.nome}</div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <div
            className={`flex items-center justify-end gap-1 font-mono text-sm font-semibold ${
              fora ? "text-destructive" : "text-primary"
            }`}
          >
            {fora && <AlertTriangle className="h-3 w-3" />}
            {t.valor_num !== null ? formatNumber(t.valor_num, 2) : (t.valor ?? "—")}
            {t.unidade && (
              <span className="text-[10px] font-normal text-muted-foreground">{t.unidade}</span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">{formatRelative(t.atualizado_em)}</div>
        </div>
        <QualityDot q={t.qualidade} />
        <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(t)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(t)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function QualityDot({ q }: { q: string | null }) {
  const v = (q ?? "").toLowerCase();
  const isGood = v === "good" || v === "boa" || v === "ok";
  const isBad = v === "bad" || v === "ruim" || v === "erro";
  const cls = isGood
    ? "bg-success"
    : isBad
      ? "bg-destructive"
      : v
        ? "bg-warning"
        : "bg-muted-foreground/30";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} title={q ?? "sem qualidade"} />;
}

function EditTagDialog({ tag, onClose }: { tag: TagRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [nomeAmigavel, setNomeAmigavel] = useState("");
  const [unidade, setUnidade] = useState("");
  const [grupo, setGrupo] = useState("");
  const [vMin, setVMin] = useState("");
  const [vMax, setVMax] = useState("");

  useEffect(() => {
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
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{tag?.nome}</DialogTitle>
          <DialogDescription>
            Esses campos são locais — não são sobrescritos pelo endpoint HTTP.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome amigável</Label>
            <Input
              value={nomeAmigavel}
              onChange={(e) => setNomeAmigavel(e.target.value)}
              placeholder="Ex.: Temperatura Reator 8"
            />
          </div>
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
          <div className="pt-2">
            <p className="mb-2 text-xs text-muted-foreground">
              Limites de alerta — valores fora desta faixa marcam a tag em vermelho.
            </p>
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

function DeleteTagDialog({ tag, onClose }: { tag: TagRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const remover = useMutation({
    mutationFn: async () => {
      if (!tag) return;
      const { error } = await supabase.rpc("delete_tag" as never, { _nome: tag.nome } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tag removida");
      qc.invalidateQueries({ queryKey: ["tags-live"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <AlertDialog open={!!tag} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover tag?</AlertDialogTitle>
          <AlertDialogDescription>
            A tag <span className="font-mono">{tag?.nome}</span> será apagada. Se o endpoint HTTP
            continuar enviando, ela será recriada no próximo ciclo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              remover.mutate();
            }}
            disabled={remover.isPending}
          >
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
