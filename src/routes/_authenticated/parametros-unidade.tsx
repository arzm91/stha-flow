import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CheckCircle2, Clock, Pencil, Plus, Printer, Trash2, AlertTriangle } from "lucide-react";
import { TagMiniTrend } from "@/components/dashboard/TagSparkline";
import { calcularLimites, calcularSet, calcularStatus, type ParamStatus } from "@/lib/parametros/status";
import { validateFormula } from "@/lib/tags/calc";

export const Route = createFileRoute("/_authenticated/parametros-unidade")({
  head: pageHead({
    title: "Parâmetros da Unidade — STHApc",
    description: "Parâmetros operacionais com set manual ou calculado, comparados às tags em tempo real e relatório A4.",
    path: "/parametros-unidade",
  }),
  component: ParametrosPage,
});

type Param = {
  id: string; nome: string; unidade: string | null; grupo: string | null;
  equipamento_id: string | null; produto_id: string | null; tag_leitura: string | null;
  set_modo: string; set_valor: number | null; set_formula: string | null;
  variaveis: Record<string, string | number>; margem_modo: string;
  margem_min: number | null; margem_max: number | null; tolerancia_ideal: number | null;
  decimais: number; ordem: number; ativo: boolean; observacao: string | null;
};
type Tag = { nome: string; nome_amigavel: string | null; valor_num: number | null; atualizado_em: string; unidade: string | null };

const STALE_MS = 5 * 60 * 1000;
const STATUS_INFO: Record<ParamStatus, { label: string; cls: string }> = {
  abaixo: { label: "Abaixo", cls: "bg-primary/15 text-primary border-primary/40" },
  ideal: { label: "Ideal", cls: "bg-success/15 text-success border-success/40" },
  dentro: { label: "Na margem", cls: "bg-warning/15 text-warning border-warning/40" },
  acima: { label: "Acima", cls: "bg-destructive/15 text-destructive border-destructive/40" },
  sem_dado: { label: "Sem dado", cls: "bg-muted text-muted-foreground border-border" },
};

function fmt(n: number | null, d = 2) {
  return n === null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function ParametrosPage() {
  const qc = useQueryClient();
  const [grupoF, setGrupoF] = useState("all");
  const [equipF, setEquipF] = useState("all");
  const [soFora, setSoFora] = useState(false);
  const [editing, setEditing] = useState<Partial<Param> | null>(null);

  const params = useQuery({
    queryKey: ["parametros-unidade"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parametros_unidade").select("*").order("ordem").order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Param[];
    },
  });
  const tags = useQuery({
    queryKey: ["parametros-unidade-tags"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.from("tags_live").select("nome,nome_amigavel,valor_num,atualizado_em,unidade").order("nome").limit(5000);
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
  });
  const equips = useQuery({
    queryKey: ["parametros-unidade-equips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos")
        .select("id,nome,troca_tag_produto,troca_produto_0_id,troca_produto_1_id").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const produtos = useQuery({
    queryKey: ["parametros-unidade-produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("id,nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const tagMap = useMemo(() => new Map((tags.data ?? []).map((t) => [t.nome, t])), [tags.data]);
  const tagValue = (n: string) => tagMap.get(n)?.valor_num ?? null;
  const prodName = (id: string | null) => produtos.data?.find((p) => p.id === id)?.nome ?? null;

  // Produto ativo por equipamento (tag 0/1 configurada na troca automática).
  const produtoAtivo = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const e of equips.data ?? []) {
      if (!e.troca_tag_produto) continue;
      const v = tagMap.get(e.troca_tag_produto)?.valor_num;
      m.set(e.id, v === null || v === undefined ? null : Number(v) >= 0.5 ? e.troca_produto_1_id : e.troca_produto_0_id);
    }
    return m;
  }, [equips.data, tagMap]);

  const rows = useMemo(() => {
    return (params.data ?? []).filter((p) => p.ativo).filter((p) => {
      if (!p.produto_id || !p.equipamento_id) return true;
      if (!produtoAtivo.has(p.equipamento_id)) return true;
      return produtoAtivo.get(p.equipamento_id) === p.produto_id;
    }).map((p) => {
      const tag = p.tag_leitura ? tagMap.get(p.tag_leitura) : undefined;
      const stale = tag ? Date.now() - new Date(tag.atualizado_em).getTime() > STALE_MS : false;
      const valor = tag?.valor_num ?? null;
      const set = p.set_modo === "formula" && p.set_formula ? calcularSet(p.set_formula, p.variaveis ?? {}, tagValue) : p.set_valor;
      const lim = calcularLimites(set, p.margem_modo, p.margem_min, p.margem_max);
      const status = calcularStatus(valor, set, lim, p.tolerancia_ideal);
      const desvio = valor !== null && set !== null ? valor - set : null;
      const desvioPct = desvio !== null && set ? (desvio / Math.abs(set)) * 100 : null;
      return { p, tag, stale, valor, set, lim, status, desvio, desvioPct };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.data, tagMap, produtoAtivo]);

  const grupos = Array.from(new Set(rows.map((r) => r.p.grupo || "Geral"))).sort();
  const filtered = rows.filter((r) =>
    (grupoF === "all" || (r.p.grupo || "Geral") === grupoF) &&
    (equipF === "all" || r.p.equipamento_id === equipF) &&
    (!soFora || r.status === "abaixo" || r.status === "acima"));
  const fora = rows.filter((r) => r.status === "abaixo" || r.status === "acima");
  const count = (s: ParamStatus) => rows.filter((r) => r.status === s).length;
  const equipName = (id: string | null) => equips.data?.find((e) => e.id === id)?.nome ?? null;

  async function remove(id: string) {
    if (!confirm("Excluir este parâmetro?")) return;
    const { error } = await supabase.from("parametros_unidade").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["parametros-unidade"] });
  }

  const byGroup = new Map<string, typeof filtered>();
  for (const r of filtered) {
    const g = r.p.grupo || "Geral";
    byGroup.set(g, [...(byGroup.get(g) ?? []), r]);
  }

  return (
    <div className="space-y-4 param-page">
      <div className="print:hidden">
        <PageHeader
          title="Parâmetros da Unidade"
          description="Valores reais comparados ao set, atualizados automaticamente."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Imprimir relatório</Button>
              <Button size="sm" onClick={() => setEditing({ set_modo: "manual", margem_modo: "abs", decimais: 2, ativo: true, variaveis: {} })}><Plus className="h-4 w-4 mr-1" />Novo parâmetro</Button>
            </div>
          }
        />
      </div>

      {/* Cabeçalho de impressão */}
      <div className="hidden print:block border-b-2 border-foreground pb-2 mb-2">
        <div className="text-lg font-bold">Relatório de Parâmetros da Unidade</div>
        <div className="text-xs">Emitido em {new Date().toLocaleString("pt-BR")} · Total {rows.length} · Ideais {count("ideal")} · Na margem {count("dentro")} · Acima {count("acima")} · Abaixo {count("abaixo")}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 print:hidden">
        {([["Total", rows.length, ""], ["Ideal", count("ideal"), "text-success"], ["Na margem", count("dentro"), "text-warning"], ["Acima", count("acima"), "text-destructive"], ["Abaixo", count("abaixo"), "text-primary"]] as const).map(([l, v, c]) => (
          <Card key={l}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{l}</div><div className={`text-2xl font-semibold ${c}`}>{v}</div></CardContent></Card>
        ))}
      </div>

      {fora.length > 0 && (
        <div className="rounded-md border-2 border-destructive bg-destructive/10 p-3 print-break-avoid">
          <div className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />Atenção: {fora.length} parâmetro(s) fora da margem</div>
          <ul className="mt-1 text-sm space-y-0.5">
            {fora.map((r) => (
              <li key={r.p.id}><b>{r.p.nome}</b>: {fmt(r.valor, r.p.decimais)} {r.p.unidade ?? ""} ({STATUS_INFO[r.status].label.toLowerCase()}; faixa {fmt(r.lim.min, r.p.decimais)} – {fmt(r.lim.max, r.p.decimais)})</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Select value={grupoF} onValueChange={setGrupoF}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Área" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas as áreas</SelectItem>{grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={equipF} onValueChange={setEquipF}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Equipamento" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os equipamentos</SelectItem>{(equips.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm"><Switch checked={soFora} onCheckedChange={setSoFora} />Só fora da margem</label>
      </div>

      {params.isLoading ? <div className="text-sm text-muted-foreground">Carregando…</div> :
        rows.length === 0 ? <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum parâmetro cadastrado. Clique em "Novo parâmetro".</CardContent></Card> :
        Array.from(byGroup.entries()).map(([g, list]) => (
          <section key={g} className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground print:text-foreground">{g}</h2>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground print:text-foreground">
                  <tr>
                    <th className="text-left p-2">Parâmetro</th><th className="text-right p-2">Atual</th><th className="text-right p-2">Set</th>
                    <th className="text-right p-2">Mín</th><th className="text-right p-2">Máx</th><th className="text-right p-2">Desvio</th>
                    <th className="p-2 w-40 print:hidden">Posição</th><th className="p-2 print:hidden">Tendência</th><th className="p-2">Status</th><th className="p-2 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const bad = r.status === "abaixo" || r.status === "acima";
                    const d = r.p.decimais;
                    return (
                      <tr key={r.p.id} className={`border-t print-break-avoid ${bad ? "bg-destructive/10 font-semibold param-bad" : ""}`}>
                        <td className="p-2">
                          <div className="flex items-center gap-1">{bad && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}{r.p.nome}</div>
                          <div className="text-xs text-muted-foreground font-normal">
                            {[equipName(r.p.equipamento_id), prodName(r.p.produto_id), r.p.set_modo === "formula" ? "set calculado" : null].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {fmt(r.valor, d)} <span className="text-xs text-muted-foreground">{r.p.unidade}</span>
                          {r.stale && <div className="text-[10px] text-warning flex items-center justify-end gap-0.5"><Clock className="h-3 w-3" />leitura atrasada</div>}
                        </td>
                        <td className="p-2 text-right tabular-nums">{fmt(r.set, d)}</td>
                        <td className="p-2 text-right tabular-nums">{fmt(r.lim.min, d)}</td>
                        <td className="p-2 text-right tabular-nums">{fmt(r.lim.max, d)}</td>
                        <td className="p-2 text-right tabular-nums">{r.desvio === null ? "—" : `${r.desvio > 0 ? "+" : ""}${fmt(r.desvio, d)}`}{r.desvioPct !== null && <div className="text-xs text-muted-foreground">{fmt(r.desvioPct, 1)}%</div>}</td>
                        <td className="p-2 print:hidden"><PosBar valor={r.valor} set={r.set} min={r.lim.min} max={r.lim.max} /></td>
                        <td className="p-2 print:hidden">{r.p.tag_leitura && <TagMiniTrend tagNome={r.p.tag_leitura} />}</td>
                        <td className="p-2"><Badge variant="outline" className={STATUS_INFO[r.status].cls}>
                          {r.status === "acima" ? <ArrowUp className="h-3 w-3 mr-0.5" /> : r.status === "abaixo" ? <ArrowDown className="h-3 w-3 mr-0.5" /> : r.status === "ideal" ? <CheckCircle2 className="h-3 w-3 mr-0.5" /> : null}
                          {STATUS_INFO[r.status].label}</Badge></td>
                        <td className="p-2 print:hidden whitespace-nowrap">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(r.p)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(r.p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

      <div className="hidden print:grid grid-cols-2 gap-8 pt-10 text-xs">
        <div><div className="border-b border-foreground h-16" />Observações</div>
        <div><div className="border-b border-foreground h-16" />Responsável / assinatura</div>
      </div>

      {editing && (
        <ParamDialog value={editing} tags={tags.data ?? []} equips={equips.data ?? []} produtos={produtos.data ?? []}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["parametros-unidade"] }); }} />
      )}
    </div>
  );
}

function PosBar({ valor, set, min, max }: { valor: number | null; set: number | null; min: number | null; max: number | null }) {
  if (valor === null || min === null || max === null || max <= min) return <span className="text-xs text-muted-foreground">—</span>;
  const span = max - min;
  const lo = min - span * 0.25, hi = max + span * 0.25;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  return (
    <div className="relative h-2 rounded bg-muted">
      <div className="absolute h-2 rounded bg-success/30" style={{ left: `${pos(min)}%`, width: `${pos(max) - pos(min)}%` }} />
      {set !== null && <div className="absolute -top-0.5 h-3 w-0.5 bg-foreground/60" style={{ left: `${pos(set)}%` }} />}
      <div className="absolute -top-1 h-4 w-1.5 -ml-0.5 rounded bg-primary" style={{ left: `${pos(valor)}%` }} />
    </div>
  );
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

function ParamDialog({ value, tags, equips, produtos, onClose, onSaved }: {
  value: Partial<Param>; tags: Tag[];
  equips: { id: string; nome: string }[]; produtos: { id: string; nome: string }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    nome: value.nome ?? "", unidade: value.unidade ?? "", grupo: value.grupo ?? "",
    equipamento_id: value.equipamento_id ?? "", produto_id: value.produto_id ?? "", tag_leitura: value.tag_leitura ?? "",
    set_modo: value.set_modo ?? "manual", set_valor: value.set_valor?.toString() ?? "", set_formula: value.set_formula ?? "",
    margem_modo: value.margem_modo ?? "abs", margem_min: value.margem_min?.toString() ?? "", margem_max: value.margem_max?.toString() ?? "",
    tolerancia_ideal: value.tolerancia_ideal?.toString() ?? "", decimais: String(value.decimais ?? 2), ordem: String(value.ordem ?? 0),
    ativo: value.ativo ?? true,
  });
  const [vars, setVars] = useState<Record<string, string | number>>(value.variaveis ?? {});
  const [pickTag, setPickTag] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const tagOpts = tags.filter((t) => !tagSearch || `${t.nome} ${t.nome_amigavel ?? ""}`.toLowerCase().includes(tagSearch.toLowerCase())).slice(0, 200);
  const insert = (tok: string) => set("set_formula", `${f.set_formula}${f.set_formula && !f.set_formula.endsWith(" ") ? " " : ""}${tok}`);
  const addTagVar = () => {
    if (!pickTag) return;
    let i = 1; while (vars[`t${i}`] !== undefined) i++;
    setVars({ ...vars, [`t${i}`]: pickTag }); insert(`t${i}`); setPickTag("");
  };
  const addConst = () => {
    let i = 1; while (vars[`K${i}`] !== undefined) i++;
    setVars({ ...vars, [`K${i}`]: 1 }); insert(`K${i}`);
  };
  const tagVal = (n: string) => tags.find((t) => t.nome === n)?.valor_num ?? null;
  const preview = f.set_modo === "formula" && f.set_formula ? calcularSet(f.set_formula, vars, tagVal) : null;

  async function save() {
    if (!f.nome.trim()) return toast.error("Informe o nome");
    if (f.set_modo === "formula") {
      const v = validateFormula(f.set_formula);
      if (!v.ok) return toast.error(`Fórmula inválida: ${v.error}`);
      const missing = v.vars.filter((x) => vars[x] === undefined);
      if (missing.length) return toast.error(`Variáveis sem definição: ${missing.join(", ")}`);
    }
    setSaving(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) throw new Error("Sessão expirada");
      const { data: owner } = await supabase.rpc("effective_owner", { _user: uid });
      const payload = {
        nome: f.nome.trim(), unidade: f.unidade.trim() || null, grupo: f.grupo.trim() || null,
        equipamento_id: f.equipamento_id || null, produto_id: f.produto_id || null, tag_leitura: f.tag_leitura || null,
        set_modo: f.set_modo, set_valor: numOrNull(f.set_valor), set_formula: f.set_modo === "formula" ? f.set_formula.trim() : null,
        variaveis: vars, margem_modo: f.margem_modo, margem_min: numOrNull(f.margem_min), margem_max: numOrNull(f.margem_max),
        tolerancia_ideal: numOrNull(f.tolerancia_ideal), decimais: Number(f.decimais) || 0, ordem: Number(f.ordem) || 0, ativo: f.ativo,
      };
      const res = value.id
        ? await supabase.from("parametros_unidade").update(payload).eq("id", value.id)
        : await supabase.from("parametros_unidade").insert({ ...payload, owner_id: owner as string });
      if (res.error) throw res.error;
      toast.success("Parâmetro salvo");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{value.id ? "Editar parâmetro" : "Novo parâmetro"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Nome</Label><Input value={f.nome} onChange={(e) => set("nome", e.target.value)} /></div>
          <div><Label>Unidade</Label><Input value={f.unidade} onChange={(e) => set("unidade", e.target.value)} placeholder="°C, bar…" /></div>
          <div><Label>Área / grupo</Label><Input value={f.grupo} onChange={(e) => set("grupo", e.target.value)} placeholder="Reator" /></div>
          <div><Label>Equipamento (opcional)</Label>
            <Select value={f.equipamento_id || "none"} onValueChange={(v) => set("equipamento_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nenhum</SelectItem>{equips.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Vale só para o produto (opcional)</Label>
            <Select value={f.produto_id || "none"} onValueChange={(v) => set("produto_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Todos os produtos</SelectItem>{produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">Usa a tag de produto (0/1) da troca automática do equipamento para mostrar só quando este produto estiver ativo.</p>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Tag de leitura (valor real)</Label>
            <Input placeholder="Buscar tag…" value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} />
            <Select value={f.tag_leitura || "none"} onValueChange={(v) => set("tag_leitura", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nenhuma</SelectItem>
                {f.tag_leitura && !tagOpts.some((t) => t.nome === f.tag_leitura) && <SelectItem value={f.tag_leitura}>{f.tag_leitura}</SelectItem>}
                {tagOpts.map((t) => <SelectItem key={t.nome} value={t.nome}>{t.nome_amigavel ? `${t.nome_amigavel} (${t.nome})` : t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-3">
              <Label>Set</Label>
              <Select value={f.set_modo} onValueChange={(v) => set("set_modo", v)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="formula">Calculado (tags e constantes)</SelectItem></SelectContent>
              </Select>
            </div>
            {f.set_modo === "manual" ? (
              <Input value={f.set_valor} onChange={(e) => set("set_valor", e.target.value)} placeholder="Valor do set" inputMode="decimal" />
            ) : (
              <div className="space-y-2">
                <Input value={f.set_formula} onChange={(e) => set("set_formula", e.target.value)} placeholder="ex.: t1 * t2 / K1" className="font-mono" />
                <div className="flex flex-wrap gap-1">
                  {["+", "-", "*", "/", "(", ")"].map((o) => <Button key={o} type="button" size="sm" variant="outline" className="h-7 px-2 font-mono" onClick={() => insert(o)}>{o}</Button>)}
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={addConst}>+ Constante K</Button>
                </div>
                <div className="flex gap-2">
                  <Select value={pickTag || "none"} onValueChange={(v) => setPickTag(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Escolher tag" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Escolher tag…</SelectItem>{tagOpts.map((t) => <SelectItem key={t.nome} value={t.nome}>{t.nome_amigavel ? `${t.nome_amigavel} (${t.nome})` : t.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="outline" onClick={addTagVar}>Inserir tag</Button>
                </div>
                {Object.keys(vars).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(vars).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-sm">
                        <span className="font-mono w-10">{k}</span>
                        {typeof v === "number" ? (
                          <Input className="h-7 w-40" defaultValue={String(v)} inputMode="decimal" onChange={(e) => setVars((p) => ({ ...p, [k]: Number(e.target.value.replace(",", ".")) || 0 }))} />
                        ) : <span className="flex-1 truncate">{v} <span className="text-muted-foreground">= {fmt(tagVal(v), 3)}</span></span>}
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setVars((p) => { const n = { ...p }; delete n[k]; return n; })}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-sm">Set calculado agora: <b>{fmt(preview, 3)}</b></div>
              </div>
            )}
          </div>

          <div><Label>Tipo de margem</Label>
            <Select value={f.margem_modo} onValueChange={(v) => set("margem_modo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="abs">Valores fixos (mín/máx)</SelectItem><SelectItem value="pct">% em torno do set</SelectItem></SelectContent>
            </Select></div>
          <div><Label>Tolerância ideal (% do set, opcional)</Label><Input value={f.tolerancia_ideal} onChange={(e) => set("tolerancia_ideal", e.target.value)} inputMode="decimal" /></div>
          <div><Label>{f.margem_modo === "pct" ? "Mín (% abaixo do set)" : "Mínimo"}</Label><Input value={f.margem_min} onChange={(e) => set("margem_min", e.target.value)} inputMode="decimal" /></div>
          <div><Label>{f.margem_modo === "pct" ? "Máx (% acima do set)" : "Máximo"}</Label><Input value={f.margem_max} onChange={(e) => set("margem_max", e.target.value)} inputMode="decimal" /></div>
          <div><Label>Casas decimais</Label><Input value={f.decimais} onChange={(e) => set("decimais", e.target.value)} inputMode="numeric" /></div>
          <div><Label>Ordem</Label><Input value={f.ordem} onChange={(e) => set("ordem", e.target.value)} inputMode="numeric" /></div>
          <label className="flex items-center gap-2 text-sm col-span-2"><Switch checked={f.ativo} onCheckedChange={(v) => set("ativo", v)} />Ativo</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
