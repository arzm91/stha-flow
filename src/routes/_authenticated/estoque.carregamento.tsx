import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  Truck,
  Settings,
  Play,
  Square,
  X,
  Weight,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { TagPicker } from "@/components/automation/TagPicker";
import { formatDate, formatNumber } from "@/lib/format";
import { requireAdminPassword } from "@/components/admin-password/AdminPasswordGate";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useResourcePermissions } from "@/hooks/useResourcePermissions";

type Config = {
  id?: string;
  tag_peso_nome: string | null;
  tag_tara_nome: string | null;
  variacao_min_kg: number | null;
  tempo_estabilizacao_seg: number | null;
  unidade: string | null;
  permitir_ajuste_manual: boolean;
};

type Carregamento = {
  id: string;
  produto_id: string;
  tanque_id: string | null;
  operador_nome: string | null;
  modo: string;
  tag_peso_nome: string | null;
  tara: number | null;
  peso_inicial: number | null;
  peso_final: number | null;
  quantidade: number | null;
  unidade: string | null;
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_seg: number | null;
  status: string;
  destino: string | null;
  placa_veiculo: string | null;
  motorista: string | null;
  ajuste_manual: boolean;
  motivo_ajuste: string | null;
  observacao: string | null;
  produto?: { codigo: string; nome: string } | null;
  tanque?: { codigo: string; nome: string; unidade: string | null } | null;
};

export const Route = createFileRoute("/_authenticated/estoque/carregamento")({
  head: pageHead({
    title: "Estoque · Carregamento — STHApc",
    description:
      "Registre carregamentos de produtos acabados com integração de balança e baixa automática de estoque.",
    path: "/estoque/carregamento",
  }),
  component: CarregamentoPage,
});

function CarregamentoPage() {
  const qc = useQueryClient();
  const { isAdmin, isGerente } = usePagePermissions();
  const resPerms = useResourcePermissions();

  const cfg = useQuery({
    queryKey: ["carregamento_config"],
    queryFn: async () => {
      const { data } = await supabase.from("carregamento_config").select("*").maybeSingle();
      return (data ?? null) as Config | null;
    },
  });

  const produtos = useQuery({
    queryKey: ["produtos-carregamento"],
    queryFn: async () =>
      (await supabase.from("produtos").select("id,codigo,nome").eq("ativo", true).order("nome"))
        .data ?? [],
  });
  const tanques = useQuery({
    queryKey: ["tanques-carregamento"],
    queryFn: async () =>
      (await supabase.from("tanques").select("id,codigo,nome,unidade").order("codigo")).data ?? [],
  });
  const visibleTanques = resPerms.filter(
    "tanque",
    tanques.data as { id: string }[] | undefined,
  ) as { id: string; codigo: string; nome: string; unidade: string | null }[];

  const cargas = useQuery({
    queryKey: ["carregamentos"],
    queryFn: async () =>
      ((
        await supabase
          .from("carregamentos")
          .select(
            "*, produto:produto_id(codigo,nome), tanque:tanque_id(codigo,nome,unidade)",
          )
          .order("iniciado_em", { ascending: false })
          .limit(200)
      ).data ?? []) as unknown as Carregamento[],
    refetchInterval: 5000,
  });

  const emAndamento = (cargas.data ?? []).filter((c) => c.status === "em_andamento");
  const historico = (cargas.data ?? []).filter((c) => c.status !== "em_andamento");

  const [novaOpen, setNovaOpen] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/estoque">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar
        </Link>
      </Button>
      <PageHeader
        title="Carregamento"
        description="Carregue produtos acabados com balança integrada. A baixa no estoque é feita automaticamente quando a carga é concluída."
        actions={
          <div className="flex gap-2">
            {(isAdmin || isGerente) && (
              <Button variant="outline" onClick={() => setCfgOpen(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </Button>
            )}
            <Button onClick={() => setNovaOpen(true)}>
              <Truck className="mr-2 h-4 w-4" />
              Nova carga
            </Button>
          </div>
        }
      />

      {emAndamento.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Cargas em andamento ({emAndamento.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {emAndamento.map((c) => (
              <CargaCard key={c.id} carga={c} config={cfg.data ?? null} />
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum carregamento registrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDate(c.finalizado_em ?? c.iniciado_em)}</TableCell>
                    <TableCell>{c.produto?.nome ?? "—"}</TableCell>
                    <TableCell>{c.tanque?.codigo ?? "—"}</TableCell>
                    <TableCell>{c.operador_nome ?? "—"}</TableCell>
                    <TableCell>
                      <ModoBadge modo={c.modo} ajuste={c.ajuste_manual} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {c.quantidade != null ? `${formatNumber(Number(c.quantidade))} ${c.unidade ?? ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {c.duracao_seg != null ? formatDuration(c.duracao_seg) : "—"}
                    </TableCell>
                    <TableCell>
                      {c.status === "concluido" ? (
                        <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                          Concluído
                        </Badge>
                      ) : (
                        <Badge variant="outline">Cancelado</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NovaCargaDialog
        open={novaOpen}
        onOpenChange={setNovaOpen}
        produtos={produtos.data ?? []}
        tanques={visibleTanques}
        config={cfg.data ?? null}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["carregamentos"] });
          setNovaOpen(false);
        }}
      />

      <ConfigDialog
        open={cfgOpen}
        onOpenChange={setCfgOpen}
        config={cfg.data ?? null}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["carregamento_config"] });
          setCfgOpen(false);
        }}
      />
    </div>
  );
}

function ModoBadge({ modo, ajuste }: { modo: string; ajuste?: boolean }) {
  const label =
    modo === "manual" ? "Manual" : modo === "tag" ? "Automático (tag)" : "Tara → Bruto";
  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline">{label}</Badge>
      {ajuste && (
        <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
          Ajuste
        </Badge>
      )}
    </div>
  );
}

function formatDuration(seg: number) {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rs = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${rs}s`;
  return `${rs}s`;
}

/* --------- Carga em andamento (card interativo) --------- */

function useTagLive(nome: string | null | undefined) {
  return useQuery({
    queryKey: ["tags-live", nome],
    queryFn: async () => {
      if (!nome) return null;
      const { data } = await supabase
        .from("tags_live")
        .select("nome,valor,valor_num,unidade,atualizado_em")
        .eq("nome", nome)
        .maybeSingle();
      return data;
    },
    enabled: !!nome,
    refetchInterval: 2000,
  });
}

function CargaCard({ carga, config }: { carga: Carregamento; config: Config | null }) {
  const qc = useQueryClient();
  const tagName = carga.tag_peso_nome ?? config?.tag_peso_nome ?? null;
  const usesTag = carga.modo === "tag" || carga.modo === "tara_bruto";
  const tag = useTagLive(usesTag ? tagName : null);
  const [now, setNow] = useState(Date.now());
  const [ajusteOpen, setAjusteOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pesoAtual = tag.data?.valor_num != null ? Number(tag.data.valor_num) : null;
  const elapsedSec = Math.floor((now - new Date(carga.iniciado_em).getTime()) / 1000);

  // detecção de estabilização (modo tag)
  const stabilityRef = useRef<{ value: number; since: number } | null>(null);
  useEffect(() => {
    if (carga.modo !== "tag" || pesoAtual == null) return;
    const variacao = Number(config?.variacao_min_kg ?? 1);
    const tempo = Number(config?.tempo_estabilizacao_seg ?? 10);
    const st = stabilityRef.current;
    if (!st || Math.abs(pesoAtual - st.value) > variacao) {
      stabilityRef.current = { value: pesoAtual, since: Date.now() };
    }
  }, [pesoAtual, carga.modo, config?.variacao_min_kg, config?.tempo_estabilizacao_seg]);

  // cálculo em tempo real
  const quantidadeParcial = useMemo(() => {
    if (carga.modo === "tara_bruto" && pesoAtual != null && carga.tara != null) {
      return Math.max(0, pesoAtual - Number(carga.tara));
    }
    if (carga.modo === "tag" && pesoAtual != null && carga.peso_inicial != null) {
      return Math.max(0, pesoAtual - Number(carga.peso_inicial));
    }
    return null;
  }, [pesoAtual, carga.modo, carga.tara, carga.peso_inicial]);

  const updateCarga = useMutation({
    mutationFn: async (patch: Partial<Carregamento>) => {
      const { error } = await supabase
        .from("carregamentos")
        .update(patch as never)
        .eq("id", carga.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carregamentos"] }),
  });

  const cancelar = async () => {
    if (!confirm("Cancelar esta carga? Nenhuma baixa será feita no estoque.")) return;
    await updateCarga.mutateAsync({
      status: "cancelado",
      finalizado_em: new Date().toISOString(),
      duracao_seg: elapsedSec,
    });
    toast.success("Carga cancelada");
  };

  const registrarTara = async () => {
    if (pesoAtual == null) return toast.error("Sem leitura da balança");
    await updateCarga.mutateAsync({ tara: pesoAtual });
    toast.success(`Tara registrada: ${formatNumber(pesoAtual)}`);
  };

  const registrarPesoInicial = async () => {
    if (pesoAtual == null) return toast.error("Sem leitura da balança");
    await updateCarga.mutateAsync({ peso_inicial: pesoAtual });
    toast.success(`Início registrado: ${formatNumber(pesoAtual)}`);
  };

  const concluir = async (pesoFinalManual?: number) => {
    let qtd: number | null = null;
    let pesoFinal: number | null = null;
    if (carga.modo === "manual") {
      if (pesoFinalManual == null || pesoFinalManual <= 0)
        return toast.error("Informe a quantidade carregada");
      qtd = pesoFinalManual;
    } else if (carga.modo === "tara_bruto") {
      if (pesoAtual == null || carga.tara == null)
        return toast.error("Registre a tara e aguarde leitura de peso");
      pesoFinal = pesoAtual;
      qtd = Math.max(0, pesoAtual - Number(carga.tara));
    } else {
      if (pesoAtual == null || carga.peso_inicial == null)
        return toast.error("Registre o peso inicial e aguarde leitura");
      pesoFinal = pesoAtual;
      qtd = Math.max(0, pesoAtual - Number(carga.peso_inicial));
    }
    if (!qtd || qtd <= 0) return toast.error("Quantidade calculada é zero");
    await updateCarga.mutateAsync({
      status: "concluido",
      peso_final: pesoFinal,
      quantidade: qtd,
      finalizado_em: new Date().toISOString(),
      duracao_seg: elapsedSec,
    });
    toast.success(`Carga concluída — ${formatNumber(qtd)} baixado do estoque`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{carga.produto?.nome ?? "Produto"}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {carga.tanque?.codigo ? `Origem: ${carga.tanque.codigo}` : "Sem tanque"} ·{" "}
              {carga.operador_nome ?? "—"}
            </p>
          </div>
          <ModoBadge modo={carga.modo} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <StatBox label="Tempo" value={formatDuration(elapsedSec)} />
          <StatBox
            label={carga.modo === "tara_bruto" ? "Tara" : "Início"}
            value={
              carga.modo === "tara_bruto"
                ? carga.tara != null
                  ? formatNumber(Number(carga.tara))
                  : "—"
                : carga.peso_inicial != null
                  ? formatNumber(Number(carga.peso_inicial))
                  : "—"
            }
          />
          <StatBox
            label={usesTag ? "Peso atual" : "Aguardando"}
            value={pesoAtual != null ? formatNumber(pesoAtual) : "—"}
          />
        </div>
        {quantidadeParcial != null && (
          <div className="rounded-md bg-accent/40 px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground">Quantidade parcial</p>
            <p className="text-lg font-semibold">
              {formatNumber(quantidadeParcial)} {carga.unidade ?? "kg"}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {carga.modo === "tara_bruto" && carga.tara == null && (
            <Button size="sm" variant="secondary" onClick={registrarTara} disabled={!usesTag}>
              <Weight className="mr-1 h-4 w-4" />
              Registrar tara
            </Button>
          )}
          {carga.modo === "tag" && carga.peso_inicial == null && (
            <Button size="sm" variant="secondary" onClick={registrarPesoInicial}>
              <Play className="mr-1 h-4 w-4" />
              Marcar início
            </Button>
          )}
          {carga.modo === "manual" ? (
            <ConcluirManualButton onConcluir={async (q) => { await concluir(q); }} unidade={carga.unidade} />
          ) : (
            <Button size="sm" onClick={() => concluir()}>
              <Square className="mr-1 h-4 w-4" />
              Concluir
            </Button>
          )}
          {(config?.permitir_ajuste_manual ?? true) && carga.modo !== "manual" && (
            <Button size="sm" variant="outline" onClick={() => setAjusteOpen(true)}>
              <ShieldAlert className="mr-1 h-4 w-4" />
              Ajustar manual
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={cancelar}>
            <X className="mr-1 h-4 w-4" />
            Cancelar
          </Button>
        </div>
      </CardContent>

      <AjusteManualDialog
        open={ajusteOpen}
        onOpenChange={setAjusteOpen}
        carga={carga}
        elapsedSec={elapsedSec}
        onDone={() => qc.invalidateQueries({ queryKey: ["carregamentos"] })}
      />
    </Card>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-medium">{value}</p>
    </div>
  );
}

function ConcluirManualButton({
  onConcluir,
  unidade,
}: {
  onConcluir: (q: number) => Promise<void>;
  unidade: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<number | "">("");
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Square className="mr-1 h-4 w-4" />
        Concluir
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Concluir carga manual</DialogTitle>
            <DialogDescription>
              Informe a quantidade total carregada em {unidade ?? "kg"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Quantidade</Label>
            <Input
              type="number"
              step="any"
              value={q}
              onChange={(e) => setQ(e.target.value === "" ? "" : Number(e.target.value))}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (q === "" || q <= 0) return;
                await onConcluir(Number(q));
                setOpen(false);
              }}
            >
              Concluir e dar baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AjusteManualDialog({
  open,
  onOpenChange,
  carga,
  elapsedSec,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  carga: Carregamento;
  elapsedSec: number;
  onDone: () => void;
}) {
  const [qtd, setQtd] = useState<number | "">("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (qtd === "" || Number(qtd) <= 0) return toast.error("Informe a quantidade");
    if (!motivo.trim()) return toast.error("Informe o motivo do ajuste");
    const ok = await requireAdminPassword("sobrescrever a leitura da balança");
    if (!ok) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("carregamentos")
        .update({
          status: "concluido",
          quantidade: Number(qtd),
          ajuste_manual: true,
          motivo_ajuste: motivo.trim(),
          finalizado_em: new Date().toISOString(),
          duracao_seg: elapsedSec,
        } as never)
        .eq("id", carga.id);
      if (error) throw error;
      toast.success("Ajuste registrado — baixa aplicada ao estoque");
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajuste manual da carga</DialogTitle>
          <DialogDescription>
            Requer senha de administrador. A quantidade digitada substituirá a leitura da balança.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Quantidade final</Label>
            <Input
              type="number"
              step="any"
              value={qtd}
              onChange={(e) => setQtd(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: Falha da balança durante a carga"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------- Dialogs de configuração e nova carga --------- */

function ConfigDialog({
  open,
  onOpenChange,
  config,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  config: Config | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Config>({
    tag_peso_nome: null,
    tag_tara_nome: null,
    variacao_min_kg: 1,
    tempo_estabilizacao_seg: 10,
    unidade: "kg",
    permitir_ajuste_manual: true,
  });

  useEffect(() => {
    if (config) setForm(config);
  }, [config, open]);

  const [saving, setSaving] = useState(false);
  const salvar = async () => {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const payload = { ...form, owner_id: u.user.id };
      if (config?.id) {
        const { error } = await supabase
          .from("carregamento_config")
          .update(payload as never)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("carregamento_config").insert(payload as never);
        if (error) throw error;
      }
      toast.success("Configuração salva");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuração da balança</DialogTitle>
          <DialogDescription>
            Tags e tolerâncias globais usadas por todas as cargas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tag de peso (balança)</Label>
            <TagPicker
              value={form.tag_peso_nome ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, tag_peso_nome: v || null }))}
              placeholder="Selecione a tag de peso"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tag de tara (opcional)</Label>
            <TagPicker
              value={form.tag_tara_nome ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, tag_tara_nome: v || null }))}
              placeholder="Selecione a tag de tara"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Variação mínima</Label>
              <Input
                type="number"
                step="any"
                value={form.variacao_min_kg ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    variacao_min_kg: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estabilização (s)</Label>
              <Input
                type="number"
                value={form.tempo_estabilizacao_seg ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    tempo_estabilizacao_seg: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input
                value={form.unidade ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value || null }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.permitir_ajuste_manual}
              onChange={(e) =>
                setForm((f) => ({ ...f, permitir_ajuste_manual: e.target.checked }))
              }
            />
            Permitir ajuste manual (com senha de administrador)
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovaCargaDialog({
  open,
  onOpenChange,
  produtos,
  tanques,
  config,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  produtos: { id: string; codigo: string; nome: string }[];
  tanques: { id: string; codigo: string; nome: string; unidade: string | null }[];
  config: Config | null;
  onCreated: () => void;
}) {
  const [produtoId, setProdutoId] = useState("");
  const [tanqueId, setTanqueId] = useState("");
  const [operador, setOperador] = useState("");
  const [modo, setModo] = useState<"manual" | "tag" | "tara_bruto">(
    config?.tag_peso_nome ? "tara_bruto" : "manual",
  );
  const [destino, setDestino] = useState("");
  const [placa, setPlaca] = useState("");
  const [motorista, setMotorista] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setProdutoId("");
      setTanqueId("");
      setOperador("");
      setDestino("");
      setPlaca("");
      setMotorista("");
      setObs("");
      setModo(config?.tag_peso_nome ? "tara_bruto" : "manual");
    }
  }, [open, config?.tag_peso_nome]);

  const iniciar = async () => {
    if (!produtoId) return toast.error("Selecione o produto");
    if (!operador.trim()) return toast.error("Informe o operador");
    if ((modo === "tag" || modo === "tara_bruto") && !config?.tag_peso_nome)
      return toast.error("Configure a tag de peso primeiro");
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const { error } = await supabase.from("carregamentos").insert({
        owner_id: u.user.id,
        produto_id: produtoId,
        tanque_id: tanqueId || null,
        operador_id: u.user.id,
        operador_nome: operador.trim(),
        modo,
        tag_peso_nome: modo === "manual" ? null : config?.tag_peso_nome ?? null,
        unidade: config?.unidade ?? "kg",
        destino: destino.trim() || null,
        placa_veiculo: placa.trim() || null,
        motorista: motorista.trim() || null,
        observacao: obs.trim() || null,
      } as never);
      if (error) throw error;
      toast.success("Carga iniciada");
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova carga</DialogTitle>
          <DialogDescription>
            Ao concluir, a quantidade é baixada automaticamente do local escolhido.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Produto</Label>
              <select
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">— selecione —</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Origem (tanque/local)</Label>
              <select
                value={tanqueId}
                onChange={(e) => setTanqueId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">— sem baixa direta —</option>
                {tanques.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.codigo} — {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Operador</Label>
              <Input value={operador} onChange={(e) => setOperador(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <Tabs value={modo} onValueChange={(v) => setModo(v as typeof modo)}>
                <TabsList className="w-full">
                  <TabsTrigger value="manual" className="flex-1 text-xs">
                    Manual
                  </TabsTrigger>
                  <TabsTrigger
                    value="tara_bruto"
                    className="flex-1 text-xs"
                    disabled={!config?.tag_peso_nome}
                  >
                    Tara → Bruto
                  </TabsTrigger>
                  <TabsTrigger
                    value="tag"
                    className="flex-1 text-xs"
                    disabled={!config?.tag_peso_nome}
                  >
                    Auto (tag)
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-1.5">
              <Label>Destino / cliente</Label>
              <Input value={destino} onChange={(e) => setDestino(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Placa</Label>
              <Input value={placa} onChange={(e) => setPlaca(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Motorista</Label>
              <Input value={motorista} onChange={(e) => setMotorista(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Observação</Label>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>
          {(modo === "tag" || modo === "tara_bruto") && !config?.tag_peso_nome && (
            <p className="text-xs text-warning">
              Para usar os modos automáticos, configure a tag de peso em Configurações.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={iniciar} disabled={saving}>
            <Play className="mr-1 h-4 w-4" />
            {saving ? "Iniciando..." : "Iniciar carga"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
