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
import { Factory, Play, Eye, LayoutGrid, CheckCircle2 } from "lucide-react";
import { gerarRelatorioProducaoPdf } from "@/lib/producao-pdf";
import { toast } from "sonner";
import { durationFromNow } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/producao/")({
  component: ProducaoPage,
});

type Equip = { id: string; codigo: string; nome: string; status: string; localizacao: string | null; tipo: string | null; ativo: boolean };

function ProducaoPage() {
  const [novaOpen, setNovaOpen] = useState(false);
  const [equipPreset, setEquipPreset] = useState<string | undefined>();

  const equipamentos = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos").select("*").eq("ativo", true).order("codigo");
      if (error) throw error;
      return (data ?? []) as Equip[];
    },
    refetchInterval: 15_000,
  });

  const opsAtivas = useQuery({
    queryKey: ["ops-ativas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_producao")
        .select("id,numero,equipamento_id,inicio_em,produto:produto_id(nome,codigo)")
        .eq("status", "em_andamento");
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const opByEquip = new Map((opsAtivas.data ?? []).map((o) => [o.equipamento_id, o]));

  const openNova = (equipId?: string) => {
    setEquipPreset(equipId);
    setNovaOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Produção"
        description="Equipamentos disponíveis e produções em andamento."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/producao/dashboard"><LayoutGrid className="mr-2 h-4 w-4" />Dashboard</Link>
            </Button>
            <Button onClick={() => openNova(undefined)}>
              <Play className="mr-2 h-4 w-4" />Nova ordem
            </Button>
          </div>
        }
      />

      {equipamentos.data && equipamentos.data.length === 0 ? (
        <EmptyState
          icon={<Factory className="h-6 w-6" />}
          title="Nenhum equipamento ativo"
          description="Cadastre equipamentos para começar a registrar produções."
          action={<Button asChild><Link to="/cadastros/equipamentos">Cadastrar equipamento</Link></Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {equipamentos.data?.map((e) => {
            const op = opByEquip.get(e.id);
            return (
              <Card key={e.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{e.codigo}</div>
                      <div className="text-base font-semibold">{e.nome}</div>
                      <div className="text-xs text-muted-foreground">{e.localizacao ?? e.tipo ?? "—"}</div>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                  {op ? (
                    <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">
                      <div className="font-medium">OP {op.numero}</div>
                      <div className="text-xs text-muted-foreground">
                        {(op.produto as { nome: string } | null)?.nome ?? ""} · há {durationFromNow(op.inicio_em)}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-muted-foreground">
                      {e.status === "manutencao" ? "Em manutenção (indisponível)." : "Disponível para nova OP."}
                    </div>
                  )}
                  <div className="mt-4 flex justify-end gap-2">
                    {op ? (
                      <>
                        <Button asChild size="sm">
                          <Link to="/producao/$id" params={{ id: op.id }}><Eye className="mr-1 h-4 w-4" />Acompanhar</Link>
                        </Button>
                        <FinalizarRapidoButton op={op} />
                      </>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => openNova(e.id)} disabled={e.status === "manutencao"}>
                        <Play className="mr-1 h-4 w-4" />Iniciar produção
                      </Button>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/producao/historico/$equipId" params={{ equipId: e.id }}>Histórico</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NovaOPDialog
        open={novaOpen}
        onOpenChange={setNovaOpen}
        equipPreset={equipPreset}
        equipamentos={equipamentos.data ?? []}
      />
    </div>
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

function FinalizarRapidoButton({ op }: { op: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qtd, setQtd] = useState<number | "">("");
  const [obs, setObs] = useState("");
  const [tanqueId, setTanqueId] = useState("");
  const [loading, setLoading] = useState(false);

  const tanques = useQuery({
    queryKey: ["tanques-prod-finalizar"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("tanques").select("id,codigo,nome").order("codigo");
      return data ?? [];
    },
  });

  useEffect(() => { if (open) { setQtd(""); setObs(""); setTanqueId(""); } }, [open]);

  const handle = async () => {
    if (qtd === "" || Number(qtd) <= 0) return toast.error("Informe a quantidade produzida");
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const fimEm = new Date().toISOString();
      const { error: e1 } = await supabase.from("ordens_producao").update({
        status: "finalizada",
        qtd_produzida: Number(qtd),
        obs_finais: obs || null,
        tanque_destino_id: tanqueId || null,
        fim_em: fimEm,
      }).eq("id", op.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("equipamentos").update({ status: "disponivel" }).eq("id", op.equipamento_id);
      if (e2) throw e2;
      if (tanqueId) {
        const { error: e3 } = await supabase.from("movimentacoes_estoque").insert({
          owner_id: u.user.id,
          produto_id: (op as any).produto?.id ?? (op as any).produto_id,
          tanque_id: tanqueId,
          tipo: "entrada",
          quantidade: Number(qtd),
          origem: `Produção OP ${op.numero}`,
          ordem_id: op.id,
          ocorrido_em: fimEm,
        });
        if (e3) throw e3;
      }
      toast.success("Produção finalizada");
      try {
        await gerarRelatorioProducaoPdf(op.id);
        toast.success("Relatório raio-X gerado");
      } catch (pdfErr) {
        toast.error("Falha ao gerar PDF: " + (pdfErr as Error).message);
      }
      setOpen(false);
      qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><CheckCircle2 className="mr-1 h-4 w-4" />Finalizar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalizar OP {op.numero}</DialogTitle>
          <DialogDescription>O equipamento voltará para "Disponível" após a finalização.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Quantidade produzida</Label>
            <Input type="number" step="any" value={qtd} onChange={(e) => setQtd(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Tanque de destino (opcional)</Label>
            <select value={tanqueId} onChange={(e) => setTanqueId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
              <option value="">— nenhum —</option>
              {(tanques.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Observações finais</Label>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handle} disabled={loading}>{loading ? "Finalizando..." : "Confirmar finalização"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
