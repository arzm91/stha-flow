import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle2, Gauge, FlaskConical, MessageSquare, Activity, AlertTriangle, Play, Square, ListChecks, Clock, History } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber, durationFromNow, durationBetween } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/producao/$id")({
  component: OPPage,
});

function OPPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const op = useQuery({
    queryKey: ["op", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_producao")
        .select("*, produto:produto_id(id,nome,codigo,unidade), equipamento:equipamento_id(id,codigo,nome,tag_nomes), tanque:tanque_destino_id(nome,codigo)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 10_000,
  });

  const operador = useQuery({
    queryKey: ["operador", op.data?.owner_id],
    enabled: !!op.data?.owner_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nome,email").eq("id", op.data!.owner_id).maybeSingle();
      return data;
    },
  });

  const parametros = useQuery({
    queryKey: ["params", id],
    queryFn: async () => {
      const { data } = await supabase.from("parametros_registrados")
        .select("*, parametro:parametro_id(nome,unidade,valor_min,valor_max)")
        .eq("ordem_id", id).order("registrado_em", { ascending: false });
      return data ?? [];
    },
  });
  const analises = useQuery({
    queryKey: ["analises", id],
    queryFn: async () => {
      const { data } = await supabase.from("analises_registradas")
        .select("*, analise:analise_id(nome,unidade,valor_min,valor_max)")
        .eq("ordem_id", id).order("registrado_em", { ascending: false });
      return data ?? [];
    },
  });
  const observacoes = useQuery({
    queryKey: ["obs", id],
    queryFn: async () => {
      const { data } = await supabase.from("observacoes_producao")
        .select("*").eq("ordem_id", id).order("registrado_em", { ascending: false });
      return data ?? [];
    },
  });

  // catalogs
  const paramCat = useQuery({ queryKey: ["param-cat"], queryFn: async () => (await supabase.from("parametros_cadastro").select("id,nome,unidade").order("nome")).data ?? [] });
  const anlCat = useQuery({ queryKey: ["anl-cat"], queryFn: async () => (await supabase.from("analises_cadastro").select("id,nome,unidade").order("nome")).data ?? [] });
  const tanquesProd = useQuery({
    queryKey: ["tanques-produto", op.data?.produto_id],
    enabled: !!op.data,
    queryFn: async () => {
      const { data } = await supabase.from("tanques").select("id,codigo,nome,produto_id").order("codigo");
      return (data ?? []).filter((t) => !t.produto_id || t.produto_id === op.data!.produto_id);
    },
  });

  if (op.isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!op.data) return <div className="text-sm text-muted-foreground">Ordem não encontrada.</div>;

  const isFinal = op.data.status === "finalizada";

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/producao"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
      </Button>
      <PageHeader
        title={`OP ${op.data.numero}`}
        description={`${(op.data.produto as any)?.nome ?? ""} · ${(op.data.equipamento as any)?.nome ?? ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={isFinal ? "bg-success/20 text-success border-success/30" : "bg-primary/20 text-primary border-primary/30"}>
              {isFinal ? "Finalizada" : "Em andamento"}
            </Badge>
            {!isFinal && <FinalizarDialog op={op.data} tanques={tanquesProd.data ?? []} onDone={() => { qc.invalidateQueries(); navigate({ to: "/producao" }); }} />}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Info label="Início" value={formatDate(op.data.inicio_em)} />
        <Info label="Fim" value={op.data.fim_em ? formatDate(op.data.fim_em) : "—"} />
        <Info label="Duração total" value={op.data.fim_em ? durationBetween(op.data.inicio_em, op.data.fim_em) : durationFromNow(op.data.inicio_em)} />
        <Info label="Qtd. planejada / produzida" value={`${formatNumber(Number(op.data.qtd_planejada))} / ${op.data.qtd_produzida != null ? formatNumber(Number(op.data.qtd_produzida)) : "—"}`} />
        <Info label="Operador" value={operador.data?.nome ?? "—"} />
        <Info label="Equipamento" value={(op.data.equipamento as any)?.nome ?? "—"} />
      </div>

      {(op.data.obs_iniciais || op.data.obs_finais) ? (
        <Card className="mb-4">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2">
            {op.data.obs_iniciais ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Observações iniciais</div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{op.data.obs_iniciais}</div>
              </div>
            ) : null}
            {op.data.obs_finais ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Observações finais</div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{op.data.obs_finais}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <TagsDoEquipamento tagNomes={((op.data.equipamento as any)?.tag_nomes ?? []) as string[]} ordemId={id} disabled={isFinal} />

      <Tabs defaultValue="processos">
        <TabsList>
          <TabsTrigger value="processos"><ListChecks className="mr-1 h-4 w-4" />Processos</TabsTrigger>
          <TabsTrigger value="parametros"><Gauge className="mr-1 h-4 w-4" />Parâmetros</TabsTrigger>
          <TabsTrigger value="analises"><FlaskConical className="mr-1 h-4 w-4" />Análises</TabsTrigger>
          <TabsTrigger value="observacoes"><MessageSquare className="mr-1 h-4 w-4" />Observações</TabsTrigger>
        </TabsList>

        <TabsContent value="processos">
          <ProcessosSection ordemId={id} produtoId={(op.data as any).produto_id} disabled={isFinal} />
        </TabsContent>


        <TabsContent value="parametros">
          <RegistroSection
            disabled={isFinal}
            label="parâmetro"
            options={paramCat.data ?? []}
            valueLabel="Valor"
            onSubmit={async (refId, valor) => {
              const { data: u } = await supabase.auth.getUser();
              if (!u.user) throw new Error("Não autenticado");
              const { error } = await supabase.from("parametros_registrados").insert({
                owner_id: u.user.id, ordem_id: id, parametro_id: refId, valor: Number(valor), registrado_em: new Date().toISOString(),
              });
              if (error) throw error;
              qc.invalidateQueries({ queryKey: ["params", id] });
            }}
            rows={(parametros.data ?? []).map((p) => ({
              id: p.id, when: p.registrado_em, name: (p.parametro as any)?.nome, unit: (p.parametro as any)?.unidade, value: Number(p.valor),
            }))}
          />
        </TabsContent>

        <TabsContent value="analises">
          <RegistroSection
            disabled={isFinal}
            label="análise"
            options={anlCat.data ?? []}
            valueLabel="Resultado"
            onSubmit={async (refId, valor) => {
              const { data: u } = await supabase.auth.getUser();
              if (!u.user) throw new Error("Não autenticado");
              const { error } = await supabase.from("analises_registradas").insert({
                owner_id: u.user.id, ordem_id: id, analise_id: refId, resultado: Number(valor), registrado_em: new Date().toISOString(),
              });
              if (error) throw error;
              qc.invalidateQueries({ queryKey: ["analises", id] });
            }}
            rows={(analises.data ?? []).map((p) => ({
              id: p.id, when: p.registrado_em, name: (p.analise as any)?.nome, unit: (p.analise as any)?.unidade, value: Number(p.resultado),
            }))}
          />
        </TabsContent>

        <TabsContent value="observacoes">
          <ObservacoesSection
            disabled={isFinal}
            rows={observacoes.data ?? []}
            onAdd={async (texto) => {
              const { data: u } = await supabase.auth.getUser();
              if (!u.user) throw new Error("Não autenticado");
              const { error } = await supabase.from("observacoes_producao").insert({
                owner_id: u.user.id, ordem_id: id, texto, registrado_em: new Date().toISOString(),
              });
              if (error) throw error;
              qc.invalidateQueries({ queryKey: ["obs", id] });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function TagsDoEquipamento({ tagNomes, ordemId, disabled }: { tagNomes: string[]; ordemId: string; disabled: boolean }) {
  const qc = useQueryClient();
  const [savingTag, setSavingTag] = useState<string | null>(null);

  const tags = useQuery({
    queryKey: ["equip-tags-live", tagNomes.slice().sort().join(",")],
    enabled: tagNomes.length > 0,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live")
        .select("nome,valor,valor_num,unidade,grupo,qualidade,valor_min,valor_max,atualizado_em")
        .in("nome", tagNomes);
      if (error) throw error;
      return data ?? [];
    },
  });

  const registrar = async (t: any) => {
    if (disabled) return toast.error("Ordem finalizada — não é possível registrar.");
    if (t?.valor_num == null) return toast.error("Tag sem valor numérico para registrar.");
    setSavingTag(t.nome);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      // Localizar ou criar parâmetro cadastrado com o mesmo nome da tag
      const { data: existing, error: selErr } = await supabase
        .from("parametros_cadastro")
        .select("id")
        .eq("owner_id", u.user.id)
        .eq("nome", t.nome)
        .maybeSingle();
      if (selErr) throw selErr;
      let parametroId = existing?.id;
      if (!parametroId) {
        const { data: created, error: insErr } = await supabase
          .from("parametros_cadastro")
          .insert({ owner_id: u.user.id, nome: t.nome, unidade: t.unidade ?? null, valor_min: t.valor_min ?? null, valor_max: t.valor_max ?? null })
          .select("id").single();
        if (insErr) throw insErr;
        parametroId = created.id;
      }
      const { error: regErr } = await supabase.from("parametros_registrados").insert({
        owner_id: u.user.id,
        ordem_id: ordemId,
        parametro_id: parametroId,
        valor: Number(t.valor_num),
        registrado_em: new Date().toISOString(),
      });
      if (regErr) throw regErr;
      toast.success(`${t.nome} registrado: ${t.valor_num}${t.unidade ? " " + t.unidade : ""}`);
      qc.invalidateQueries({ queryKey: ["params", ordemId] });
      qc.invalidateQueries({ queryKey: ["param-cat"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingTag(null);
    }
  };

  if (tagNomes.length === 0) return null;

  const byName = new Map((tags.data ?? []).map((t) => [t.nome, t]));

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Tags do equipamento
        </CardTitle>
        <span className="text-xs text-muted-foreground">Clique para registrar o valor atual</span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
          {tagNomes.map((nome) => {
            const t = byName.get(nome) as any;
            const num = t?.valor_num != null ? Number(t.valor_num) : null;
            const min = t?.valor_min != null ? Number(t.valor_min) : null;
            const max = t?.valor_max != null ? Number(t.valor_max) : null;
            const fora = num != null && ((min != null && num < min) || (max != null && num > max));
            const clickable = !!t && num != null && !disabled;
            const saving = savingTag === nome;
            return (
              <button
                type="button"
                key={nome}
                onClick={() => clickable && registrar(t)}
                disabled={!clickable || saving}
                title={clickable ? "Clique para registrar este valor no histórico" : disabled ? "Ordem finalizada" : "Sem valor numérico"}
                className={`text-left rounded-md border p-3 transition ${fora ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/20"} ${clickable ? "hover:border-primary/60 hover:bg-primary/5 cursor-pointer" : "opacity-70 cursor-not-allowed"} ${saving ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-muted-foreground" title={nome}>{nome}</span>
                  {fora ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> : null}
                </div>
                <div className="mt-1 font-mono text-lg font-semibold">
                  {t ? (t.valor ?? "—") : <span className="text-muted-foreground text-sm">sem dados</span>}
                  {t?.unidade ? <span className="ml-1 text-xs text-muted-foreground">{t.unidade}</span> : null}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{t?.grupo ?? ""}</span>
                  <span>{t?.atualizado_em ? formatDate(t.atualizado_em) : ""}</span>
                </div>
                {saving ? <div className="mt-1 text-[10px] text-primary">Registrando...</div> : null}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RegistroSection({
  disabled, label, options, valueLabel, onSubmit, rows,
}: {
  disabled: boolean;
  label: string;
  options: { id: string; nome: string; unidade?: string | null }[];
  valueLabel: string;
  onSubmit: (refId: string, valor: number) => Promise<void>;
  rows: { id: string; when: string; name?: string; unit?: string | null; value: number }[];
}) {
  const [refId, setRefId] = useState("");
  const [valor, setValor] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base">Novo registro</CardTitle></CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!refId || valor === "") return;
              setLoading(true);
              try { await onSubmit(refId, Number(valor)); setValor(""); toast.success("Registrado"); }
              catch (err) { toast.error((err as Error).message); }
              finally { setLoading(false); }
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label>{label.charAt(0).toUpperCase() + label.slice(1)}</Label>
              <select value={refId} onChange={(e) => setRefId(e.target.value)} required disabled={disabled}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— selecione —</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.nome}{o.unidade ? ` (${o.unidade})` : ""}</option>)}
              </select>
              {options.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cadastro disponível.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{valueLabel}</Label>
              <Input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value === "" ? "" : Number(e.target.value))} required disabled={disabled} />
            </div>
            <Button type="submit" disabled={disabled || loading} className="w-full">Registrar</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>{label.charAt(0).toUpperCase() + label.slice(1)}</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.when)}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="font-mono">{formatNumber(r.value)}{r.unit ? ` ${r.unit}` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ObservacoesSection({
  disabled, rows, onAdd,
}: {
  disabled: boolean;
  rows: { id: string; texto: string; registrado_em: string }[];
  onAdd: (texto: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle className="text-base">Nova observação</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            setLoading(true);
            try { await onAdd(texto); setTexto(""); toast.success("Registrada"); }
            catch (err) { toast.error((err as Error).message); } finally { setLoading(false); }
          }} className="space-y-3">
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} required disabled={disabled}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <Button type="submit" disabled={disabled || loading} className="w-full">Adicionar</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma observação ainda.</p> :
            rows.map((o) => (
              <div key={o.id} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="mb-1 text-xs text-muted-foreground">{formatDate(o.registrado_em)}</div>
                <div className="whitespace-pre-wrap text-sm">{o.texto}</div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

function FinalizarDialog({
  op, tanques, onDone,
}: { op: any; tanques: { id: string; codigo: string; nome: string }[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [qtd, setQtd] = useState<number | "">("");
  const [obs, setObs] = useState("");
  const [tanqueId, setTanqueId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setQtd(""); setObs(""); setTanqueId(""); } }, [open]);

  const handle = async () => {
    if (qtd === "" || Number(qtd) <= 0) return toast.error("Informe quantidade produzida");
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
          produto_id: op.produto_id,
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
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><CheckCircle2 className="mr-2 h-4 w-4" />Finalizar Produção</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Finalizar OP {op.numero}</DialogTitle></DialogHeader>
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
              {tanques.map((t) => <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Selecione um tanque para gerar entrada automática no estoque.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Observações finais</Label>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handle} disabled={loading}>Confirmar finalização</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  materia_prima: { label: "Matéria-prima", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  medicao: { label: "Medição", cls: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  acao: { label: "Ação", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
};

function formatDuracao(seg: number) {
  if (seg < 60) return `${seg}s`;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function ProcessosSection({ ordemId, produtoId, disabled }: { ordemId: string; produtoId: string; disabled: boolean }) {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const processos = useQuery({
    queryKey: ["produto-processos", produtoId],
    enabled: !!produtoId,
    queryFn: async () => {
      const { data: ps, error } = await supabase
        .from("produto_processos")
        .select("id, nome, ordem")
        .eq("produto_id", produtoId)
        .order("ordem", { ascending: true });
      if (error) throw error;
      const ids = (ps ?? []).map((p) => p.id);
      const { data: ats } = ids.length
        ? await supabase
            .from("produto_atividades")
            .select("id, processo_id, descricao, ordem, tipo, quantidade, unidade, tempo_estimado_min")
            .in("processo_id", ids)
            .order("ordem", { ascending: true })
        : { data: [] };
      return (ps ?? []).map((p) => ({
        ...p,
        atividades: ((ats ?? []) as any[]).filter((a) => a.processo_id === p.id),
      }));
    },
  });

  const etapas = useQuery({
    queryKey: ["ordem-etapas", ordemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordem_etapas")
        .select("*")
        .eq("ordem_id", ordemId)
        .order("iniciado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5_000,
  });

  const iniciar = async (params: {
    processoId: string; processoNome: string; ordemProcesso: number;
    atividadeId?: string | null; descricao?: string | null; tipo?: string | null; ordemAtividade?: number;
  }) => {
    if (disabled) return toast.error("Ordem finalizada.");
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const { error } = await supabase.from("ordem_etapas").insert({
        owner_id: u.user.id,
        ordem_id: ordemId,
        processo_id: params.processoId,
        processo_nome: params.processoNome,
        ordem_processo: params.ordemProcesso,
        atividade_id: params.atividadeId ?? null,
        atividade_descricao: params.descricao ?? null,
        tipo: params.tipo ?? null,
        ordem_atividade: params.ordemAtividade ?? 0,
        iniciado_em: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Etapa iniciada");
      qc.invalidateQueries({ queryKey: ["ordem-etapas", ordemId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const finalizar = async (etapaId: string, iniciadoEm: string) => {
    try {
      const fim = new Date();
      const dur = Math.max(0, Math.floor((fim.getTime() - new Date(iniciadoEm).getTime()) / 1000));
      const { error } = await supabase
        .from("ordem_etapas")
        .update({ finalizado_em: fim.toISOString(), duracao_seg: dur })
        .eq("id", etapaId);
      if (error) throw error;
      toast.success(`Etapa finalizada (${formatDuracao(dur)})`);
      qc.invalidateQueries({ queryKey: ["ordem-etapas", ordemId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const abertas = (etapas.data ?? []).filter((e: any) => !e.finalizado_em);
  const abertaPorChave = new Map<string, any>();
  for (const e of abertas) {
    const key = `${e.processo_id ?? ""}|${e.atividade_id ?? ""}`;
    if (!abertaPorChave.has(key)) abertaPorChave.set(key, e);
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {processos.isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
        {processos.data && processos.data.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhum processo cadastrado para este produto.</CardContent></Card>
        ) : null}
        {(processos.data ?? []).map((p: any) => {
          const procKey = `${p.id}|`;
          const procAberta = abertaPorChave.get(procKey);
          return (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{p.ordem + 1}.</span>
                  {p.nome}
                </CardTitle>
                {procAberta ? (
                  <Button size="sm" variant="outline" onClick={() => finalizar(procAberta.id, procAberta.iniciado_em)} disabled={disabled}>
                    <Square className="mr-1 h-3.5 w-3.5" /> Finalizar processo
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {formatDuracao(Math.floor((now - new Date(procAberta.iniciado_em).getTime()) / 1000))}
                    </span>
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => iniciar({ processoId: p.id, processoNome: p.nome, ordemProcesso: p.ordem })} disabled={disabled}>
                    <Play className="mr-1 h-3.5 w-3.5" /> Iniciar processo
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {p.atividades.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem atividades.</p>
                ) : p.atividades.map((a: any) => {
                  const key = `${p.id}|${a.id}`;
                  const aberta = abertaPorChave.get(key);
                  const tipoInfo = TIPO_BADGE[a.tipo] ?? { label: a.tipo, cls: "" };
                  return (
                    <div key={a.id} className="flex items-center gap-2 rounded border border-border/60 p-2">
                      <span className="font-mono text-xs text-muted-foreground">{p.ordem + 1}.{a.ordem + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{a.descricao}</span>
                          <Badge variant="outline" className={`text-[10px] ${tipoInfo.cls}`}>{tipoInfo.label}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                          {a.quantidade != null ? <span>{a.quantidade}{a.unidade ? ` ${a.unidade}` : ""}</span> : null}
                          {a.tempo_estimado_min != null ? <span>~{a.tempo_estimado_min} min</span> : null}
                        </div>
                      </div>
                      {aberta ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-primary">
                            {formatDuracao(Math.floor((now - new Date(aberta.iniciado_em).getTime()) / 1000))}
                          </span>
                          <Button size="sm" variant="outline" onClick={() => finalizar(aberta.id, aberta.iniciado_em)} disabled={disabled}>
                            <Square className="mr-1 h-3.5 w-3.5" /> Finalizar
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => iniciar({
                          processoId: p.id, processoNome: p.nome, ordemProcesso: p.ordem,
                          atividadeId: a.id, descricao: a.descricao, tipo: a.tipo, ordemAtividade: a.ordem,
                        })} disabled={disabled}>
                          <Play className="mr-1 h-3.5 w-3.5" /> Iniciar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="lg:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />Histórico de etapas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(etapas.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma etapa registrada.</p>
          ) : (etapas.data ?? []).map((e: any) => {
            const dur = e.duracao_seg != null
              ? formatDuracao(e.duracao_seg)
              : formatDuracao(Math.floor((now - new Date(e.iniciado_em).getTime()) / 1000));
            return (
              <div key={e.id} className={`rounded-md border p-2 text-xs ${e.finalizado_em ? "border-border bg-muted/20" : "border-primary/40 bg-primary/5"}`}>
                <div className="font-medium">
                  {e.processo_nome}
                  {e.atividade_descricao ? <span className="text-muted-foreground"> · {e.atividade_descricao}</span> : null}
                </div>
                <div className="mt-1 flex items-center justify-between text-muted-foreground">
                  <span>{formatDate(e.iniciado_em)}</span>
                  <span className={`font-mono ${e.finalizado_em ? "" : "text-primary"}`}>{dur}</span>
                </div>
                {e.finalizado_em ? (
                  <div className="text-[10px] text-muted-foreground">Fim: {formatDate(e.finalizado_em)}</div>
                ) : (
                  <div className="text-[10px] text-primary">em andamento</div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

