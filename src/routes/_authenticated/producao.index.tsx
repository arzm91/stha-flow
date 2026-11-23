import { useProdutosAtivos } from "@/lib/producao/produto-ativo";
import { calcularIndice, parseIndices } from "@/lib/indices/calc";
import { pageHead } from "@/lib/seo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { Factory, Play, Eye, LayoutGrid, FileText, Plus } from "lucide-react";
import { RegistrarProducaoManualDialog } from "@/components/producao/RegistrarProducaoManualDialog";
import { useHistoricoEquip, useParadasAbertas, somaIncrementos } from "@/lib/producao/producao-24h";
import { toast } from "sonner";
import { durationFromNow } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/producao/")({
  head: pageHead({ title: "Produção — STHApc", description: "Monitoramento contínuo dos equipamentos de produção nas últimas 24 horas.", path: "/producao" }),
  component: ProducaoPage,
});

type Equip = { id: string; codigo: string; nome: string; status: string; localizacao: string | null; tipo: string | null; ativo: boolean; tag_producao_total: string | null; tag_velocidade_producao: string | null; tag_indices: string[] | null; indices_config?: unknown };

function ProducaoPage() {
  const qc = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);

  const equipamentos = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("*").eq("ativo", true).eq("categoria", "producao").order("codigo");
      if (error) throw error;
      return (data ?? []) as Equip[];
    },
    refetchInterval: 15_000,
  });
  const paradas = useParadasAbertas();
  const ativosQ = useProdutosAtivos((equipamentos.data ?? []).map((e) => e.id));

  const cfgOf = (e: Equip) => parseIndices(e.indices_config).filter((c) => c.tag || c.formula);
  const tagsCards = Array.from(new Set(
    (equipamentos.data ?? []).flatMap((e) => [
      e.tag_producao_total, e.tag_velocidade_producao,
      ...(cfgOf(e).length > 0 ? [] : ((e.tag_indices ?? []) as string[])),
      ...cfgOf(e).flatMap((c) => [c.tag, ...((c.formula || "").match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? [])]).filter((v) => v !== "VALOR" && v !== "CONC_PROD"),
    ].filter(Boolean) as string[])
  ));
  const tagsQuery = useQuery({
    queryKey: ["equip-cards-tags", tagsCards.join(",")],
    enabled: tagsCards.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("tags_live").select("nome,nome_amigavel,valor_num,unidade").in("nome", tagsCards);
      return (data ?? []) as Array<{ nome: string; nome_amigavel: string | null; valor_num: number | null; unidade: string | null }>;
    },
    refetchInterval: 5000,
  });
  const tagMap = new Map((tagsQuery.data ?? []).map((t) => [t.nome, t]));

  return (
    <div>
      <PageHeader
        title="Produção"
        description="Equipamentos em monitoramento contínuo — últimas 24 horas."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/relatorios/$slug" params={{ slug: "producao-periodo" }}><FileText className="mr-2 h-4 w-4" />Relatório</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/producao/pcp"><LayoutGrid className="mr-2 h-4 w-4" />Ordens finalizadas</Link>
            </Button>
            <Button onClick={() => setManualOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Registrar produção
            </Button>
          </div>
        }
      />

      {equipamentos.data && equipamentos.data.length === 0 ? (
        <EmptyState
          icon={<Factory className="h-6 w-6" />}
          title="Nenhum equipamento ativo"
          description="Cadastre equipamentos para começar a monitorar a produção."
          action={<Button asChild><Link to="/cadastros/equipamentos">Cadastrar equipamento</Link></Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {equipamentos.data?.map((e) => (
            <EquipCard
              key={e.id}
              e={e}
              paradaDesde={paradas.data?.get(e.id) ?? null}
              produto={ativosQ.data?.[e.id] ?? null}
              tagMap={tagMap}
              cfg={cfgOf(e)}
            />
          ))}
        </div>
      )}

      <RegistrarProducaoManualDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        equipamentos={(equipamentos.data ?? []) as never}
        onDone={() => qc.invalidateQueries({ queryKey: ["equipamentos"] })}
      />
    </div>
  );
}

type TagInfo = { nome: string; nome_amigavel: string | null; valor_num: number | null; unidade: string | null };

function EquipCard({ e, paradaDesde, produto, tagMap, cfg }: {
  e: Equip; paradaDesde: string | null;
  produto: { nome: string; concentracao: number | null } | null;
  tagMap: Map<string, TagInfo>; cfg: ReturnType<typeof parseIndices>;
}) {
  const hist = useHistoricoEquip(e.id, e.tag_producao_total);
  const prod24 = somaIncrementos((hist.data ?? []).map((p) => p.v));
  const unid = e.tag_producao_total ? tagMap.get(e.tag_producao_total)?.unidade ?? "" : "";
  const vel = e.tag_velocidade_producao ? tagMap.get(e.tag_velocidade_producao) : undefined;
  const manut = e.status === "manutencao";
  const parado = !!paradaDesde;
  const fmt = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }));
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-xs text-muted-foreground">{e.codigo}</div>
            <div className="text-base font-semibold">{e.nome}</div>
            <div className="text-xs text-muted-foreground">{produto?.nome ?? "Produto não identificado"}{produto?.concentracao != null ? ` · ${produto.concentracao}%` : ""}</div>
          </div>
          {manut ? <Badge variant="outline">Manutenção</Badge>
            : parado ? <Badge variant="destructive">Parado · {durationFromNow(paradaDesde!)}</Badge>
            : <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Em operação</Badge>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Produzido 24h</div>
            <div className="font-mono text-lg font-semibold text-primary">{e.tag_producao_total ? fmt(prod24) : "—"} <span className="text-xs">{unid}</span></div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Velocidade</div>
            <div className="font-mono text-lg font-semibold">{fmt(vel?.valor_num)} <span className="text-xs">{vel?.unidade ?? ""}</span></div>
          </div>
        </div>
        {cfg.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
            {cfg.map((c, i) => {
              const v = calcularIndice(c, (n) => tagMap.get(n)?.valor_num ?? null, produto?.concentracao ?? null);
              return (
                <div key={i} className="flex items-baseline justify-between gap-1 rounded bg-muted/60 px-1.5 py-0.5">
                  <span className="truncate text-muted-foreground" title={c.formula || c.tag}>{c.nome || c.tag}</span>
                  <span className="font-mono font-semibold">{v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: c.decimais, maximumFractionDigits: c.decimais }) : "—"}{c.unidade ? ` ${c.unidade}` : ""}</span>
                </div>
              );
            })}
          </div>
        ) : ((e.tag_indices ?? []) as string[]).length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
            {((e.tag_indices ?? []) as string[]).map((n) => {
              const t = tagMap.get(n);
              return (
                <div key={n} className="flex items-baseline justify-between gap-1 rounded bg-muted/60 px-1.5 py-0.5">
                  <span className="truncate text-muted-foreground">{t?.nome_amigavel?.trim() || n}</span>
                  <span className="font-mono font-semibold">{fmt(t?.valor_num)}{t?.unidade ? ` ${t.unidade}` : ""}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="mt-auto flex justify-end gap-2 pt-4">
          <Button asChild size="sm">
            <Link to="/producao/equipamento/$equipId" params={{ equipId: e.id }}><Eye className="mr-1 h-4 w-4" />Acompanhar</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/producao/historico/$equipId" params={{ equipId: e.id }}>Histórico</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    disponivel: { label: "Disponível", cls: "bg-success/20 text-success border-success/30" },
    ocupado: { label: "Ocupado", cls: "bg-primary/20 text-primary border-primary/30" },
    parado: { label: "Parado", cls: "bg-warning/20 text-warning border-warning/30" },
    manutencao: { label: "Manutenção", cls: "bg-destructive/20 text-destructive border-destructive/30" },
  };
  const v = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
}

function NovaOPDialog({
  open,
  onOpenChange,
  equipPreset,
  equipamentos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  equipPreset?: string;
  equipamentos: Equip[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [numero, setNumero] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [qtdPlanejada, setQtdPlanejada] = useState<number | "">("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (open) {
      setNumero("");
      setProdutoId("");
      setEquipamentoId(equipPreset ?? "");
      setQtdPlanejada("");
      setObs("");
    }
  }, [open, equipPreset]);

  const produtos = useQuery({
    queryKey: ["produtos-ativos"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id,codigo,nome").eq("ativo", true).order("nome");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!numero || !produtoId || !equipamentoId || qtdPlanejada === "") {
        throw new Error("Preencha todos os campos obrigatórios");
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const { data, error } = await supabase
        .from("ordens_producao")
        .insert({
          owner_id: u.user.id,
          numero,
          produto_id: produtoId,
          equipamento_id: equipamentoId,
          qtd_planejada: Number(qtdPlanejada),
          obs_iniciais: obs || null,
          status: "em_andamento",
          inicio_em: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("equipamentos").update({ status: "ocupado" }).eq("id", equipamentoId);
      if (e2) throw e2;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Ordem iniciada");
      qc.invalidateQueries();
      onOpenChange(false);
      navigate({ to: "/producao/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Produção</DialogTitle>
          <DialogDescription>Abra uma OP para iniciar a produção em um equipamento.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="numero">Número da OP</Label>
              <Input id="numero" value={numero} onChange={(e) => setNumero(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qtd">Quantidade planejada</Label>
              <Input
                id="qtd"
                type="number"
                step="any"
                value={qtdPlanejada}
                onChange={(e) => setQtdPlanejada(e.target.value === "" ? "" : Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="produto">Produto</Label>
              <select
                id="produto"
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">— selecione —</option>
                {produtos.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nome}
                  </option>
                ))}
              </select>
              {produtos.data && produtos.data.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum produto cadastrado.{" "}
                  <Link to="/cadastros/produtos" className="underline">
                    Cadastrar
                  </Link>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equip">Equipamento</Label>
              <select
                id="equip"
                value={equipamentoId}
                onChange={(e) => setEquipamentoId(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">— selecione —</option>
                {equipamentos.map((eq) => (
                  <option key={eq.id} value={eq.id} disabled={(eq.status === "ocupado" && eq.id !== equipPreset) || eq.status === "manutencao"}>
                    {eq.codigo} — {eq.nome}
                    {eq.status === "ocupado" ? " (ocupado)" : eq.status === "manutencao" ? " (em manutenção)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações iniciais</Label>
            <textarea
              id="obs"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Iniciando..." : "Iniciar Produção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
