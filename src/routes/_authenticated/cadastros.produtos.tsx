import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Trash2, Search, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { useResourcePermissions } from "@/hooks/useResourcePermissions";


export const Route = createFileRoute("/_authenticated/cadastros/produtos")({
  component: ProdutosPage,
});

type Produto = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  unidade: string;
  categoria: string | null;
  ativo: boolean;
};

type TipoEtapa = "materia_prima" | "tarefa" | "tag_captura";

type GatilhoTipo = "inicio" | "fim";
type GatilhoOperador = "gt" | "lt" | "gte" | "lte" | "eq" | "neq" | "change";

type Gatilho = {
  tipo: GatilhoTipo;
  tag_nome: string;
  operador: GatilhoOperador;
  valor: string; // string for the form; converted to number on save (or null when change)
};

type QtdModo = "fixa" | "tag_valor" | "tag_diferenca";
type CapturaModo = "na_execucao" | "gatilho_valor";

type Etapa = {
  id?: string;
  descricao: string;
  tipo: TipoEtapa;
  quantidade: string;
  unidade: string;
  tempo_estimado_min: string;
  tag_nome: string; // used by tag_captura
  gatilhos: Gatilho[]; // only for materia_prima
  // matéria-prima — origem da quantidade
  qtd_modo: QtdModo;
  qtd_tag_nome: string;
  // matéria-prima por diferença — estabilização automática (fallback sem gatilhos)
  estab_enabled: boolean;
  estab_pct: string;
  estab_janela_seg: string;
  estab_min_estavel_seg: string;
  // tag_captura — modo da captura
  captura_modo: CapturaModo;
  captura_operador: GatilhoOperador;
  captura_valor: string;
};

const TIPO_LABEL: Record<TipoEtapa, string> = {
  materia_prima: "Matéria-prima",
  tarefa: "Tarefa",
  tag_captura: "Captação de tag",
};

const OPERADOR_LABEL: Record<GatilhoOperador, string> = {
  gt: "maior que (>)",
  lt: "menor que (<)",
  gte: "maior ou igual (≥)",
  lte: "menor ou igual (≤)",
  eq: "igual (=)",
  neq: "diferente (≠)",
  change: "qualquer mudança",
};

const emptyProduto = { codigo: "", nome: "", descricao: "", unidade: "", categoria: "", ativo: true };

function newEtapa(): Etapa {
  return {
    descricao: "",
    tipo: "tarefa",
    quantidade: "",
    unidade: "",
    tempo_estimado_min: "",
    tag_nome: "",
    gatilhos: [],
    qtd_modo: "fixa",
    qtd_tag_nome: "",
    estab_enabled: false,
    estab_pct: "2",
    estab_janela_seg: "30",
    estab_min_estavel_seg: "30",
    captura_modo: "na_execucao",
    captura_operador: "gt",
    captura_valor: "",
  };
}

function newGatilho(tipo: GatilhoTipo): Gatilho {
  return { tipo, tag_nome: "", operador: "gt", valor: "" };
}

function tagLabel(t: { nome: string; nome_amigavel?: string | null; grupo?: string | null; unidade?: string | null }): string {
  const main = t.nome_amigavel?.trim() ? t.nome_amigavel : t.nome;
  const tech = t.nome_amigavel?.trim() ? ` · ${t.nome}` : "";
  const grp = t.grupo ? ` (${t.grupo})` : "";
  const un = t.unidade ? ` · ${t.unidade}` : "";
  return `${main}${grp}${un}${tech}`;
}



function normalizeTipo(raw: string | null | undefined): TipoEtapa {
  if (raw === "materia_prima" || raw === "tag_captura") return raw;
  return "tarefa"; // map legacy "acao" / "medicao" / null -> tarefa
}

function ProdutosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [form, setForm] = useState<typeof emptyProduto>(emptyProduto);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  type ReceitaItem = { id?: string; materia_prima_id: string; percentual: string; tag_consumo_nome: string };
  const [receita, setReceita] = useState<ReceitaItem[]>([]);

  const list = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Produto[]) ?? [];
    },
  });

  // counts of etapas per produto (across all processes for legacy compatibility)
  const counts = useQuery({
    queryKey: ["produtos-etapas-count"],
    queryFn: async () => {
      const { data: procs } = await supabase.from("produto_processos").select("id, produto_id").eq("ativo", true);
      const procToProd: Record<string, string> = {};
      for (const p of (procs ?? []) as { id: string; produto_id: string }[]) procToProd[p.id] = p.produto_id;
      const ids = Object.keys(procToProd);
      if (!ids.length) return {} as Record<string, number>;
      const { data: ativs } = await supabase.from("produto_atividades").select("processo_id").in("processo_id", ids);
      const map: Record<string, number> = {};
      for (const a of (ativs ?? []) as { processo_id: string }[]) {
        const pid = procToProd[a.processo_id];
        if (pid) map[pid] = (map[pid] ?? 0) + 1;
      }
      return map;
    },
  });

  // tags disponíveis (capturadas dos endpoints)
  const tagsList = useQuery({
    queryKey: ["tags-live-nomes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags_live")
        .select("nome, nome_amigavel, grupo, unidade")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ nome: string; nome_amigavel: string | null; grupo: string | null; unidade: string | null }>;
    },
  });


  const resPerms = useResourcePermissions();
  const visible = resPerms.filter("produto", list.data).filter((p) => p.categoria !== "materia_prima");
  const filtered = visible.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [r.nome, r.codigo, r.categoria ?? ""].some((v) => v.toLowerCase().includes(s));
  });

  // MPs available for recipe
  const mpList = useQuery({
    queryKey: ["materias-primas-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos")
        .select("id, codigo, nome, unidade")
        .eq("categoria", "materia_prima").eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string; unidade: string }[];
    },
  });


  const openCreate = () => {
    setEditing(null);
    setForm(emptyProduto);
    setEtapas([]);
    setReceita([]);
    setOpen(true);
  };

  const openEdit = async (r: Produto) => {
    setEditing(r);
    setForm({
      codigo: r.codigo,
      nome: r.nome,
      descricao: r.descricao ?? "",
      unidade: r.unidade,
      categoria: r.categoria ?? "",
      ativo: r.ativo,
    });
    // load only the ACTIVE version of the process (older versions stay archived for running orders)
    const { data: procs } = await supabase
      .from("produto_processos")
      .select("id, ordem")
      .eq("produto_id", r.id)
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    const procIds = (procs ?? []).map((p) => p.id);
    const { data: ativs } = procIds.length
      ? await supabase
          .from("produto_atividades")
          .select("id, processo_id, descricao, ordem, tipo, quantidade, unidade, tempo_estimado_min, tag_nome, gatilhos, qtd_modo, qtd_tag_nome, captura_modo, captura_gatilho, estab_enabled, estab_pct, estab_janela_seg, estab_min_estavel_seg")
          .in("processo_id", procIds)
          .order("ordem", { ascending: true })
      : { data: [] };
    const procOrder = new Map<string, number>();
    (procs ?? []).forEach((p, idx) => procOrder.set(p.id, idx));
    const all = ((ativs ?? []) as Array<{
      id: string; processo_id: string; descricao: string; tipo: string | null;
      quantidade: number | null; unidade: string | null; tempo_estimado_min: number | null;
      tag_nome: string | null; ordem: number; gatilhos: unknown;
      qtd_modo: string | null; qtd_tag_nome: string | null;
      captura_modo: string | null; captura_gatilho: unknown;
      estab_enabled: boolean | null; estab_pct: number | null;
      estab_janela_seg: number | null; estab_min_estavel_seg: number | null;
    }>).slice().sort((a, b) => {
      const pa = procOrder.get(a.processo_id) ?? 0;
      const pb = procOrder.get(b.processo_id) ?? 0;
      if (pa !== pb) return pa - pb;
      return a.ordem - b.ordem;
    });
    setEtapas(
      all.map((a) => {
        const gats = Array.isArray(a.gatilhos)
          ? (a.gatilhos as Array<Partial<Gatilho> & { valor?: number | string | null }>).map((g) => ({
              tipo: (g.tipo === "fim" ? "fim" : "inicio") as GatilhoTipo,
              tag_nome: g.tag_nome ?? "",
              operador: (g.operador as GatilhoOperador) ?? "gt",
              valor: g.valor == null ? "" : String(g.valor),
            }))
          : [];
        const cg = (a.captura_gatilho ?? {}) as { operador?: string; valor?: number | string | null };
        return {
          id: a.id,
          descricao: a.descricao,
          tipo: normalizeTipo(a.tipo),
          quantidade: a.quantidade == null ? "" : String(a.quantidade),
          unidade: a.unidade ?? "",
          tempo_estimado_min: a.tempo_estimado_min == null ? "" : String(a.tempo_estimado_min),
          tag_nome: a.tag_nome ?? "",
          gatilhos: gats,
          qtd_modo: ((a.qtd_modo === "tag_valor" || a.qtd_modo === "tag_diferenca") ? a.qtd_modo : "fixa") as QtdModo,
          qtd_tag_nome: a.qtd_tag_nome ?? "",
          estab_enabled: !!a.estab_enabled,
          estab_pct: a.estab_pct == null ? "2" : String(a.estab_pct),
          estab_janela_seg: a.estab_janela_seg == null ? "30" : String(a.estab_janela_seg),
          estab_min_estavel_seg: a.estab_min_estavel_seg == null ? "30" : String(a.estab_min_estavel_seg),
          captura_modo: (a.captura_modo === "gatilho_valor" ? "gatilho_valor" : "na_execucao") as CapturaModo,
          captura_operador: ((cg.operador as GatilhoOperador) ?? "gt"),
          captura_valor: cg.valor == null ? "" : String(cg.valor),
        };
      }),
    );

    // Load recipe
    const { data: rec } = await supabase.from("produto_receita")
      .select("id, materia_prima_id, percentual, tag_consumo_nome, ordem")
      .eq("produto_id", r.id).order("ordem");
    setReceita(((rec ?? []) as Array<{ id: string; materia_prima_id: string; percentual: number | null; tag_consumo_nome: string | null }>).map((x) => ({
      id: x.id,
      materia_prima_id: x.materia_prima_id,
      percentual: x.percentual == null ? "" : String(x.percentual),
      tag_consumo_nome: x.tag_consumo_nome ?? "",
    })));

    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      if (editing) {
        const { guardAdmin } = await import("@/lib/security/guard-admin");
        await guardAdmin(`editar o produto "${editing.nome}"`);
      }
      const ownerId = u.user.id;
      const payload = {
        ...form,
        descricao: form.descricao || null,
        categoria: form.categoria || null,
        owner_id: ownerId,
      };

      let produtoId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("produtos").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("produtos").insert(payload).select("id").single();
        if (error) throw error;
        produtoId = data.id;
      }
      if (!produtoId) throw new Error("Falha ao salvar produto");

      const etapasValidas = etapas.filter((e) => e.descricao.trim());
      if (etapasValidas.length === 0) return;

      const atividadesPayload = etapasValidas.map((e, idx) => {
        const gatilhos =
          e.tipo === "materia_prima"
            ? e.gatilhos
                .filter((g) => g.tag_nome.trim())
                .map((g) => ({
                  tipo: g.tipo,
                  tag_nome: g.tag_nome.trim(),
                  operador: g.operador,
                  valor: g.operador === "change" || g.valor === "" ? null : Number(g.valor),
                }))
            : [];
        return {
          descricao: e.descricao.trim(),
          ordem: idx,
          tipo: e.tipo,
          quantidade: e.tipo === "materia_prima" && e.qtd_modo === "fixa" && e.quantidade !== "" ? String(Number(e.quantidade)) : "",
          unidade: e.tipo === "tag_captura" ? (e.unidade || "") : e.tipo === "materia_prima" ? (e.unidade || "") : "",
          tempo_estimado_min: e.tempo_estimado_min === "" ? "" : String(Number(e.tempo_estimado_min)),
          tag_nome: e.tipo === "tag_captura" ? (e.tag_nome || "") : "",
          gatilhos,
          qtd_modo: e.tipo === "materia_prima" ? e.qtd_modo : "fixa",
          qtd_tag_nome: e.tipo === "materia_prima" && e.qtd_modo !== "fixa" ? (e.qtd_tag_nome || "") : "",
          captura_modo: e.tipo === "tag_captura" ? e.captura_modo : "na_execucao",
          captura_gatilho:
            e.tipo === "tag_captura" && e.captura_modo === "gatilho_valor"
              ? {
                  operador: e.captura_operador,
                  valor: e.captura_operador === "change" || e.captura_valor === "" ? null : Number(e.captura_valor),
                }
              : null,
          estab_enabled: e.tipo === "materia_prima" && e.qtd_modo === "tag_diferenca" ? !!e.estab_enabled : false,
          estab_pct: e.estab_pct === "" ? "2" : String(Number(e.estab_pct)),
          estab_janela_seg: e.estab_janela_seg === "" ? "30" : String(Math.max(5, Number(e.estab_janela_seg))),
          estab_min_estavel_seg: e.estab_min_estavel_seg === "" ? "30" : String(Math.max(5, Number(e.estab_min_estavel_seg))),
        };
      });

      // Atomic save: archives previous active version and creates a new one in a single transaction.
      // If anything fails the database is rolled back and your form data stays intact.
      const { error: rpcErr } = await supabase.rpc("save_produto_processo", {
        p_produto_id: produtoId,
        p_nome: "Processo de fabricação",
        p_atividades: atividadesPayload,
      });
      if (rpcErr) throw rpcErr;

      // Save recipe (replace all items for this product)
      const recValid = receita.filter((r) => r.materia_prima_id);
      const total = recValid.reduce((s, r) => s + (Number(r.percentual) || 0), 0);
      if (recValid.length > 0 && Math.round(total * 100) / 100 > 100.01) {
        throw new Error(`A soma das porcentagens da receita é ${total.toFixed(2)}%. Não pode ultrapassar 100%.`);
      }
      const { error: delErr } = await supabase.from("produto_receita").delete().eq("produto_id", produtoId);
      if (delErr) throw delErr;
      if (recValid.length > 0) {
        const rows = recValid.map((r, idx) => ({
          produto_id: produtoId!,
          materia_prima_id: r.materia_prima_id,
          percentual: Number(r.percentual) || 0,
          tag_consumo_nome: r.tag_consumo_nome.trim() || null,
          ordem: idx,
          owner_id: u.user.id,
        }));
        const { error: insErr } = await supabase.from("produto_receita").insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Produto atualizado" : "Produto criado");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-etapas-count"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyProduto);
      setEtapas([]);
      setReceita([]);
    },
    onError: async (e: Error & { code?: string; details?: string; hint?: string }) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (isAdminCancelled(e)) return;
      // Translate common Postgres errors into something users can act on.
      const raw = (e?.message || "") + " " + (e?.details || "");
      let friendly = e.message;
      if (e.code === "23503" || /foreign key|violates|forgrei/i.test(raw)) {
        friendly =
          "Não foi possível salvar porque este produto está vinculado a ordens de produção, alertas ou outros registros. " +
          "Suas alterações no formulário foram preservadas — feche, finalize/remova o vínculo apontado e tente novamente.";
      } else if (e.code === "23505") {
        friendly = "Já existe um registro com esse código. Use um código diferente.";
      } else if (e.code === "23514") {
        friendly = "Algum campo está com valor inválido. Revise os campos destacados.";
      }
      toast.error(friendly, { duration: 8000 });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { guardAdmin } = await import("@/lib/security/guard-admin");
      await guardAdmin("excluir este produto");
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-etapas-count"] });
    },
    onError: async (e: Error) => {
      const { isAdminCancelled } = await import("@/lib/security/guard-admin");
      if (!isAdminCancelled(e)) toast.error(e.message);
    },
  });

  // etapa editors
  const addEtapa = () => setEtapas((prev) => [...prev, newEtapa()]);
  const updateEtapa = (i: number, patch: Partial<Etapa>) =>
    setEtapas((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const removeEtapa = (i: number) => setEtapas((prev) => prev.filter((_, idx) => idx !== i));
  const moveEtapa = (i: number, dir: -1 | 1) =>
    setEtapas((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addGatilho = (ei: number, tipo: GatilhoTipo) =>
    updateEtapa(ei, { gatilhos: [...etapas[ei].gatilhos, newGatilho(tipo)] });
  const updateGatilho = (ei: number, gi: number, patch: Partial<Gatilho>) =>
    updateEtapa(ei, {
      gatilhos: etapas[ei].gatilhos.map((g, idx) => (idx === gi ? { ...g, ...patch } : g)),
    });
  const removeGatilho = (ei: number, gi: number) =>
    updateEtapa(ei, { gatilhos: etapas[ei].gatilhos.filter((_, idx) => idx !== gi) });

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastro de produtos e etapas do processo de fabricação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
                <DialogDescription>
                  Defina os dados do produto e as etapas do processo de fabricação.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate();
                }}
                className="space-y-5"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Código *">
                    <Input required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                  </Field>
                  <Field label="Nome *">
                    <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                  </Field>
                  <Field label="Unidade *">
                    <Input required placeholder="kg, L, un..." value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
                  </Field>
                  <Field label="Categoria">
                    <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Descrição">
                      <textarea
                        value={form.descricao}
                        onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                        className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </Field>
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <input
                      id="ativo"
                      type="checkbox"
                      checked={form.ativo}
                      onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                      className="h-4 w-4 accent-primary"
                    />
                    <Label htmlFor="ativo">Ativo</Label>
                  </div>
                </div>

                {/* ==== RECEITA (matérias-primas por %) ==== */}
                <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Receita — matérias-primas</h3>
                      <p className="text-xs text-muted-foreground">
                        Defina o percentual de cada MP para 100% do produto. Opcionalmente, associe uma tag de consumo — se a tag estiver disponível na ordem, o valor real da tag é usado; caso contrário, a baixa usa o percentual informado.
                      </p>
                    </div>
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => setReceita((p) => [...p, { materia_prima_id: "", percentual: "", tag_consumo_nome: "" }])}
                    >
                      <Plus className="mr-1 h-4 w-4" /> MP
                    </Button>
                  </div>

                  {receita.length === 0 ? (
                    <p className="rounded border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
                      Nenhuma matéria-prima adicionada. Cadastre as MPs em Cadastros → Matérias-primas.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {receita.map((r, ri) => (
                        <div key={ri} className="grid grid-cols-12 gap-2 rounded-md border border-border bg-background p-2 items-center">
                          <select
                            value={r.materia_prima_id}
                            onChange={(ev) => setReceita((prev) => prev.map((x, i) => i === ri ? { ...x, materia_prima_id: ev.target.value } : x))}
                            className="col-span-5 h-9 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="">— Selecione MP —</option>
                            {(mpList.data ?? []).map((m) => (
                              <option key={m.id} value={m.id}>{m.codigo} — {m.nome} ({m.unidade})</option>
                            ))}
                          </select>
                          <div className="col-span-2 flex items-center gap-1">
                            <Input
                              type="number" step="0.01" min="0" max="100"
                              value={r.percentual}
                              onChange={(ev) => setReceita((prev) => prev.map((x, i) => i === ri ? { ...x, percentual: ev.target.value } : x))}
                              placeholder="%" className="h-9"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <select
                            value={r.tag_consumo_nome}
                            onChange={(ev) => setReceita((prev) => prev.map((x, i) => i === ri ? { ...x, tag_consumo_nome: ev.target.value } : x))}
                            className="col-span-4 h-9 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="">Sem tag (usa %)</option>
                            {(tagsList.data ?? []).map((t) => (
                              <option key={t.nome} value={t.nome}>{t.nome_amigavel || t.nome}</option>
                            ))}
                          </select>
                          <Button
                            type="button" variant="ghost" size="icon"
                            className="col-span-1"
                            onClick={() => setReceita((prev) => prev.filter((_, i) => i !== ri))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex justify-end text-xs text-muted-foreground">
                        Soma: {receita.reduce((s, r) => s + (Number(r.percentual) || 0), 0).toFixed(2)}% (não pode passar de 100%)
                      </div>
                    </div>
                  )}
                </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Processo de fabricação</h3>
                      <p className="text-xs text-muted-foreground">
                        Adicione as etapas em ordem: matérias-primas, tarefas (medições/ações) e captações de tag.
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={addEtapa}>
                      <Plus className="mr-1 h-4 w-4" /> Etapa
                    </Button>
                  </div>

                  {etapas.length === 0 ? (
                    <p className="rounded border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
                      Nenhuma etapa adicionada.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {etapas.map((e, ei) => (
                        <div key={ei} className="rounded-md border border-border bg-background p-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">{ei + 1}.</span>
                            <select
                              value={e.tipo}
                              onChange={(ev) => {
                                const tipo = ev.target.value as TipoEtapa;
                                updateEtapa(ei, {
                                  tipo,
                                  gatilhos: tipo === "materia_prima" ? e.gatilhos : [],
                                });
                              }}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="materia_prima">{TIPO_LABEL.materia_prima}</option>
                              <option value="tarefa">{TIPO_LABEL.tarefa}</option>
                              <option value="tag_captura">{TIPO_LABEL.tag_captura}</option>
                            </select>
                            <Input
                              value={e.descricao}
                              onChange={(ev) => updateEtapa(ei, { descricao: ev.target.value })}
                              placeholder={
                                e.tipo === "materia_prima" ? "Nome da matéria-prima"
                                : e.tipo === "tarefa" ? "Descrição da tarefa (ex.: medir pH)"
                                : "Descrição da captação"
                              }
                              className="h-8 flex-1"
                            />
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => moveEtapa(ei, -1)} disabled={ei === 0}>↑</Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => moveEtapa(ei, 1)} disabled={ei === etapas.length - 1}>↓</Button>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeEtapa(ei)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="mt-2 grid grid-cols-12 gap-2">
                            {e.tipo === "materia_prima" ? (
                              <>
                                <div className="col-span-12 sm:col-span-4">
                                  <select
                                    value={e.qtd_modo}
                                    onChange={(ev) => updateEtapa(ei, { qtd_modo: ev.target.value as QtdModo })}
                                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                    title="Origem da quantidade carregada"
                                  >
                                    <option value="fixa">Quantidade fixa</option>
                                    <option value="tag_valor">Valor da tag (no fim)</option>
                                    <option value="tag_diferenca">Diferença da tag (fim − início)</option>
                                  </select>
                                </div>
                                {e.qtd_modo === "fixa" ? (
                                  <div className="col-span-6 sm:col-span-3">
                                    <Input
                                      type="number"
                                      step="0.001"
                                      value={e.quantidade}
                                      onChange={(ev) => updateEtapa(ei, { quantidade: ev.target.value })}
                                      placeholder="Quantidade"
                                      className="h-8"
                                    />
                                  </div>
                                ) : (
                                  <div className="col-span-12 sm:col-span-3">
                                    <select
                                      value={e.qtd_tag_nome}
                                      onChange={(ev) => {
                                        const sel = (tagsList.data ?? []).find((t) => t.nome === ev.target.value);
                                        updateEtapa(ei, {
                                          qtd_tag_nome: ev.target.value,
                                          unidade: sel?.unidade ?? e.unidade,
                                        });
                                      }}
                                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                    >
                                      <option value="">— tag de origem —</option>
                                      {(tagsList.data ?? []).map((t) => (
                                        <option key={t.nome} value={t.nome}>
                                          {tagLabel(t)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                <div className="col-span-3 sm:col-span-2">
                                  <Input
                                    value={e.unidade}
                                    onChange={(ev) => updateEtapa(ei, { unidade: ev.target.value })}
                                    placeholder="un"
                                    className="h-8"
                                  />
                                </div>
                                <div className="col-span-3 sm:col-span-3">
                                  <Input
                                    type="number"
                                    value={e.tempo_estimado_min}
                                    onChange={(ev) => updateEtapa(ei, { tempo_estimado_min: ev.target.value })}
                                    placeholder="Tempo (min)"
                                    className="h-8"
                                    title="Tempo previsto de dosagem (fallback quando não houver gatilho de fim)."
                                  />
                                </div>
                                {e.qtd_modo !== "fixa" && (
                                  <div className="col-span-12 text-[11px] text-muted-foreground">
                                    {e.qtd_modo === "tag_diferenca"
                                      ? "O sistema lê a tag no gatilho de início, lê novamente no gatilho de fim, e registra a diferença."
                                      : "O sistema lê o valor da tag no gatilho de fim e registra como quantidade."}
                                  </div>
                                )}
                                {e.qtd_modo === "tag_diferenca" && (
                                  <div className="col-span-12 rounded-md border border-dashed border-input p-2 space-y-2">
                                    <label className="flex items-center gap-2 text-xs font-medium">
                                      <input
                                        type="checkbox"
                                        checked={e.estab_enabled}
                                        onChange={(ev) => updateEtapa(ei, { estab_enabled: ev.target.checked })}
                                      />
                                      Detectar início/fim pela estabilização da tag (sem gatilhos)
                                    </label>
                                    {e.estab_enabled && (
                                      <>
                                        <div className="text-[11px] text-muted-foreground">
                                          Quando a variação da tag ultrapassar o limite, o sistema captura o valor inicial.
                                          Ao estabilizar novamente dentro do limite por X segundos, registra a diferença.
                                        </div>
                                        <div className="grid grid-cols-12 gap-2">
                                          <div className="col-span-4">
                                            <Input
                                              type="number"
                                              step="0.1"
                                              min="0.1"
                                              value={e.estab_pct}
                                              onChange={(ev) => updateEtapa(ei, { estab_pct: ev.target.value })}
                                              placeholder="% variação"
                                              className="h-8"
                                              title="Limite percentual de variação (ex.: 2 = 2%)"
                                            />
                                            <div className="text-[10px] text-muted-foreground mt-0.5">% variação</div>
                                          </div>
                                          <div className="col-span-4">
                                            <Input
                                              type="number"
                                              min="5"
                                              value={e.estab_janela_seg}
                                              onChange={(ev) => updateEtapa(ei, { estab_janela_seg: ev.target.value })}
                                              placeholder="Janela (s)"
                                              className="h-8"
                                              title="Janela de tempo (segundos) onde a variação é medida"
                                            />
                                            <div className="text-[10px] text-muted-foreground mt-0.5">janela (s)</div>
                                          </div>
                                          <div className="col-span-4">
                                            <Input
                                              type="number"
                                              min="5"
                                              value={e.estab_min_estavel_seg}
                                              onChange={(ev) => updateEtapa(ei, { estab_min_estavel_seg: ev.target.value })}
                                              placeholder="Estável por (s)"
                                              className="h-8"
                                              title="Tempo mínimo estável para encerrar (segundos)"
                                            />
                                            <div className="text-[10px] text-muted-foreground mt-0.5">estável por (s)</div>
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </>
                            ) : e.tipo === "tag_captura" ? (
                              <>
                                <div className="col-span-12 sm:col-span-6">
                                  <select
                                    value={e.tag_nome}
                                    onChange={(ev) => {
                                      const sel = (tagsList.data ?? []).find((t) => t.nome === ev.target.value);
                                      updateEtapa(ei, {
                                        tag_nome: ev.target.value,
                                        unidade: sel?.unidade ?? e.unidade,
                                      });
                                    }}
                                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                  >
                                    <option value="">— selecione a tag —</option>
                                    {(tagsList.data ?? []).map((t) => (
                                      <option key={t.nome} value={t.nome}>
                                        {tagLabel(t)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-span-12 sm:col-span-3">
                                  <select
                                    value={e.captura_modo}
                                    onChange={(ev) => updateEtapa(ei, { captura_modo: ev.target.value as CapturaModo })}
                                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                  >
                                    <option value="na_execucao">Capturar no fim da etapa</option>
                                    <option value="gatilho_valor">Capturar por condição</option>
                                  </select>
                                </div>
                                <div className="col-span-12 sm:col-span-3">
                                  <Input
                                    type="number"
                                    value={e.tempo_estimado_min}
                                    onChange={(ev) => updateEtapa(ei, { tempo_estimado_min: ev.target.value })}
                                    placeholder="Tempo (min, fallback)"
                                    className="h-8"
                                  />
                                </div>
                                {e.captura_modo === "gatilho_valor" && (
                                  <>
                                    <div className="col-span-6 sm:col-span-4">
                                      <select
                                        value={e.captura_operador}
                                        onChange={(ev) => updateEtapa(ei, { captura_operador: ev.target.value as GatilhoOperador })}
                                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                      >
                                        {(Object.keys(OPERADOR_LABEL) as GatilhoOperador[]).map((op) => (
                                          <option key={op} value={op}>{OPERADOR_LABEL[op]}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="col-span-6 sm:col-span-3">
                                      <Input
                                        type="number"
                                        value={e.captura_valor}
                                        disabled={e.captura_operador === "change"}
                                        onChange={(ev) => updateEtapa(ei, { captura_valor: ev.target.value })}
                                        placeholder="Valor da condição"
                                        className="h-8"
                                      />
                                    </div>
                                  </>
                                )}
                                <div className="col-span-12 text-[11px] text-muted-foreground">
                                  {e.captura_modo === "gatilho_valor"
                                    ? "Captura o valor da tag quando a condição acima for atendida."
                                    : "Captura o valor atual da tag no fim da etapa."}
                                </div>
                              </>
                            ) : (
                              <div className="col-span-12 sm:col-span-4">
                                <Input
                                  type="number"
                                  value={e.tempo_estimado_min}
                                  onChange={(ev) => updateEtapa(ei, { tempo_estimado_min: ev.target.value })}
                                  placeholder="Tempo estimado (min)"
                                  className="h-8"
                                />
                              </div>
                            )}
                          </div>


                          {e.tipo === "materia_prima" ? (
                            <div className="mt-3 rounded border border-dashed border-border bg-muted/30 p-2">
                              <div className="mb-2 flex items-center justify-between">
                                <div>
                                  <p className="text-xs font-semibold">Gatilhos por tag (opcional)</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Condições para iniciar ou finalizar automaticamente a adição. O tempo de adição acima continua sendo o primário.
                                  </p>
                                </div>
                                <div className="flex gap-1">
                                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => addGatilho(ei, "inicio")}>
                                    <Plus className="mr-1 h-3 w-3" /> Início
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => addGatilho(ei, "fim")}>
                                    <Plus className="mr-1 h-3 w-3" /> Fim
                                  </Button>
                                </div>
                              </div>
                              {e.gatilhos.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground">Nenhum gatilho.</p>
                              ) : (
                                <div className="space-y-2">
                                  {e.gatilhos.map((g, gi) => (
                                    <div key={gi} className="grid grid-cols-12 items-center gap-2">
                                      <select
                                        value={g.tipo}
                                        onChange={(ev) => updateGatilho(ei, gi, { tipo: ev.target.value as GatilhoTipo })}
                                        className="col-span-3 sm:col-span-2 h-8 rounded-md border border-input bg-background px-2 text-xs"
                                      >
                                        <option value="inicio">Início</option>
                                        <option value="fim">Fim</option>
                                      </select>
                                      <select
                                        value={g.tag_nome}
                                        onChange={(ev) => updateGatilho(ei, gi, { tag_nome: ev.target.value })}
                                        className="col-span-9 sm:col-span-4 h-8 rounded-md border border-input bg-background px-2 text-xs"
                                      >
                                        <option value="">— tag —</option>
                                        {(tagsList.data ?? []).map((t) => (
                                          <option key={t.nome} value={t.nome}>
                                            {tagLabel(t)}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={g.operador}
                                        onChange={(ev) => updateGatilho(ei, gi, { operador: ev.target.value as GatilhoOperador })}
                                        className="col-span-6 sm:col-span-3 h-8 rounded-md border border-input bg-background px-2 text-xs"
                                      >
                                        {(Object.keys(OPERADOR_LABEL) as GatilhoOperador[]).map((op) => (
                                          <option key={op} value={op}>{OPERADOR_LABEL[op]}</option>
                                        ))}
                                      </select>
                                      <div className="col-span-5 sm:col-span-2">
                                        <Input
                                          type="number"
                                          value={g.valor}
                                          disabled={g.operador === "change"}
                                          onChange={(ev) => updateGatilho(ei, gi, { valor: ev.target.value })}
                                          placeholder="Valor"
                                          className="h-8"
                                        />
                                      </div>
                                      <div className="col-span-1 flex justify-end">
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeGatilho(ei, gi)}>
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={save.isPending}>{editing ? "Salvar" : "Criar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {list.data && list.data.length === 0 ? (
        <EmptyState
          title="Nenhum produto"
          description="Cadastre o primeiro produto para começar."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Novo</Button>}
        />
      ) : (
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Etapas</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.codigo}</TableCell>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell>{r.unidade}</TableCell>
                  <TableCell>{r.categoria ?? "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
                      <ListChecks className="h-3 w-3" />
                      {counts.data?.[r.id] ?? 0}
                    </span>
                  </TableCell>
                  <TableCell>{r.ativo ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Confirma a exclusão?")) remove.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
