import { indiceCorrigido } from "@/lib/reports-v2/producao-periodo";
import { acumuladoTotalizador, consumoMp, consumoBaseIndice, type Pt } from "@/lib/producao/auto-preenchimento";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Play,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { guardAdmin, isAdminCancelled } from "@/lib/security/guard-admin";
import { fetchNextOpNumero } from "@/lib/producao/next-op-numero";
import { usePagePermissions } from "@/hooks/usePagePermissions";
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

type Prioridade = "alta" | "media" | "baixa";
type Status = "programada" | "em_andamento" | "finalizada" | "cancelada";

type Ordem = {
  id: string;
  numero: string;
  produto_id: string;
  equipamento_id: string;
  qtd_planejada: number;
  qtd_produzida: number | null;
  status: Status;
  inicio_em: string | null;
  fim_em: string | null;
  inicio_previsto: string | null;
  duracao_estimada_min: number | null;
  prioridade: Prioridade;
  fila_posicao: number | null;
  auto_iniciar: boolean;
  produto: { nome: string; codigo: string } | null;
  equipamento: { nome: string; codigo: string; status: string } | null;
};

type Equip = { id: string; codigo: string; nome: string; status: string };
type Prod = { id: string; codigo: string; nome: string; concentracao?: number | null; equipamento_id?: string | null; tag_clp?: string | null; tag_valor_ativacao?: number | null; tag_total_producao?: string | null };

async function historicoTag(equipId: string, tag: string, ini: string, fim: string): Promise<Pt[]> {
  const out: Pt[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabase.from("producao_tag_historico").select("valor_num,registrado_em")
      .eq("equipamento_id", equipId).eq("tag_nome", tag).gte("registrado_em", ini).lte("registrado_em", fim)
      .order("registrado_em", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) if (r.valor_num != null) out.push({ t: new Date(r.registrado_em).getTime(), v: Number(r.valor_num) });
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const PRIO_LABEL: Record<Prioridade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const PRIO_CLS: Record<Prioridade, string> = {
  alta: "bg-destructive/15 text-destructive border-destructive/30",
  media: "bg-warning/15 text-warning border-warning/30",
  baixa: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL: Record<Status, string> = {
  programada: "Programada",
  em_andamento: "Em andamento",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtDur(min: number | null | undefined) {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}
function toLocalDateTimeInput(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function colorForEquip(id: string) {
  // hash to HSL
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 45%)`;
}

// ============= Registrar produção manual (retroativa, já finalizada) =============

export function RegistrarProducaoManualDialog({
  open, onOpenChange, equipamentos, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  equipamentos: Equip[];
  onDone: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [qtdPlanejada, setQtdPlanejada] = useState<number | "">("");
  const [qtdProduzida, setQtdProduzida] = useState<number | "">("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [tanqueId, setTanqueId] = useState("");
  const [obsIniciais, setObsIniciais] = useState("");
  const [obsFinais, setObsFinais] = useState("");
  const [lancarEstoque, setLancarEstoque] = useState(true);
  const [responsavel, setResponsavel] = useState("");
  const [concMedia, setConcMedia] = useState<string>("");
  const [mats, setMats] = useState<Array<{ mp_id: string; nome: string; unidade: string; percentual: number | null; tag: string | null; modo: string; fator: number; qtd: string; tanque_id: string }>>([]);
  const [autoMsg, setAutoMsg] = useState<string>("");
  const [autoLoading, setAutoLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNumero(""); setProdutoId(""); setEquipamentoId("");
    setQtdPlanejada(""); setQtdProduzida("");
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    setInicio(toLocalDateTimeInput(oneHourAgo.toISOString()));
    setFim(toLocalDateTimeInput(now.toISOString()));
    setTanqueId(""); setObsIniciais(""); setObsFinais(""); setLancarEstoque(true);
    setResponsavel(""); setMats([]); setAutoMsg("");
    fetchNextOpNumero().then((n) => setNumero((cur) => cur || n)).catch(() => {});
  }, [open]);

  const produtos = useQuery({
    queryKey: ["pcp-produtos"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id,codigo,nome,concentracao,equipamento_id,tag_clp,tag_valor_ativacao,tag_total_producao").eq("ativo", true).neq("categoria", "materia_prima").order("nome");
      return (data ?? []) as Prod[];
    },
  });

  const tanques = useQuery({
    queryKey: ["pcp-tanques", produtoId],
    enabled: !!produtoId,
    queryFn: async () => {
      const { data } = await supabase.from("tanques").select("id,codigo,nome,produto_id").order("codigo");
      return (data ?? []).filter((t: any) => !t.produto_id || t.produto_id === produtoId);
    },
  });

  const concCad = (produtos.data ?? []).find((p) => p.id === produtoId)?.concentracao ?? null;
  useEffect(() => { setConcMedia(concCad != null ? String(concCad) : ""); }, [produtoId, concCad]);
  const indicePrev = qtdProduzida === "" ? null : indiceCorrigido(
    consumoBaseIndice(mats), Number(qtdProduzida),
    concCad, concMedia === "" ? null : Number(concMedia));

  // Receita do produto -> matérias-primas
  useEffect(() => {
    if (!produtoId) { setMats([]); return; }
    (async () => {
      const { data: rec } = await supabase.from("produto_receita")
        .select("materia_prima_id, percentual, tag_consumo_nome, mp:materia_prima_id(nome,unidade,tag_consumo,consumo_modo,consumo_fator)")
        .eq("produto_id", produtoId).order("ordem");
      setMats(((rec ?? []) as any[]).map((r) => ({
        mp_id: r.materia_prima_id, nome: r.mp?.nome ?? "—", unidade: r.mp?.unidade ?? "",
        percentual: r.percentual, tag: r.mp?.tag_consumo || r.tag_consumo_nome || null,
        modo: r.mp?.consumo_modo ?? "totalizador", fator: Number(r.mp?.consumo_fator ?? 1), qtd: "", tanque_id: "",
      })));
    })();
  }, [produtoId]);

  // Equipamento automático quando só há um
  useEffect(() => {
    if (open && !equipamentoId && equipamentos.length === 1) setEquipamentoId(equipamentos[0]!.id);
  }, [open, equipamentos, equipamentoId]);

  // Início = fim da última produção registrada no equipamento
  useEffect(() => {
    if (!open || !equipamentoId) return;
    (async () => {
      const { data } = await supabase.from("ordens_producao").select("fim_em").eq("equipamento_id", equipamentoId)
        .eq("status", "finalizada").not("fim_em", "is", null).order("fim_em", { ascending: false }).limit(1).maybeSingle();
      if (data?.fim_em && new Date(data.fim_em).getTime() < Date.now()) setInicio(toLocalDateTimeInput(data.fim_em));
    })();
  }, [open, equipamentoId]);

  // Produto automático pela tag de identificação do CLP
  useEffect(() => {
    if (!open || !equipamentoId || produtoId) return;
    const cands = (produtos.data ?? []).filter((p) => p.equipamento_id === equipamentoId && p.tag_clp && p.tag_valor_ativacao != null);
    if (!cands.length) return;
    (async () => {
      const nomes = Array.from(new Set(cands.map((c) => c.tag_clp!)));
      const { data } = await supabase.from("tags_live").select("nome,valor_num").in("nome", nomes);
      const m = new Map((data ?? []).map((t: any) => [t.nome, Number(t.valor_num)]));
      const ativo = cands.find((c) => m.get(c.tag_clp!) === Number(c.tag_valor_ativacao));
      if (ativo) setProdutoId(ativo.id);
    })();
  }, [open, equipamentoId, produtoId, produtos.data]);

  const buscarDoClp = async () => {
    const prod = (produtos.data ?? []).find((p) => p.id === produtoId);
    if (!equipamentoId || !prod || !inicio || !fim) return;
    setAutoLoading(true);
    try {
      const ini = new Date(inicio).toISOString(), fi = new Date(fim).toISOString();
      const { data: eq } = await supabase.from("equipamentos").select("tag_producao_total").eq("id", equipamentoId).maybeSingle();
      const tagTot = prod.tag_total_producao || eq?.tag_producao_total || null;
      const idPts = prod.tag_clp && prod.tag_valor_ativacao != null ? await historicoTag(equipamentoId, prod.tag_clp, ini, fi) : null;
      const ativ = prod.tag_valor_ativacao != null ? Number(prod.tag_valor_ativacao) : null;
      const partes: string[] = [];
      if (tagTot) {
        const pts = await historicoTag(equipamentoId, tagTot, ini, fi);
        if (pts.length > 1) { setQtdProduzida(+acumuladoTotalizador(pts, idPts, ativ).toFixed(3)); partes.push(`produção pela tag ${tagTot}`); }
      }
      const novos = await Promise.all(mats.map(async (m) => {
        if (!m.tag) return m;
        const pts = await historicoTag(equipamentoId, m.tag, ini, fi);
        if (pts.length < 2) return m;
        return { ...m, qtd: String(+consumoMp(pts, m.modo, m.fator, idPts, ativ).toFixed(3)) };
      }));
      const nTags = novos.filter((m, i) => m.qtd !== mats[i]!.qtd).length;
      if (nTags) partes.push(`${nTags} matéria(s)-prima(s) pelas tags de consumo`);
      setMats(novos);
      setAutoMsg(partes.length ? `Preenchido automaticamente: ${partes.join(" e ")}. Confira antes de salvar.` : "Sem leituras de tags no período — preencha manualmente.");
    } catch (e) {
      setAutoMsg("Falha ao buscar dados do CLP: " + (e as Error).message);
    } finally { setAutoLoading(false); }
  };

  const matsKey = mats.map((m) => m.mp_id).join(",");
  useEffect(() => {
    if (open && equipamentoId && produtoId && inicio && fim) void buscarDoClp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, equipamentoId, produtoId, inicio, fim, matsKey, produtos.data]);

  // Sugestão de consumo pelo percentual da receita
  useEffect(() => {
    if (qtdProduzida === "") return;
    setMats((prev) => prev.map((m) => m.qtd === ""
      ? { ...m, qtd: m.percentual != null ? String(+(Number(qtdProduzida) * m.percentual / 100).toFixed(3)) : m.qtd }
      : m));
  }, [qtdProduzida]);

  const tanquesMp = useQuery({
    queryKey: ["pcp-tanques-mp"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("tanques").select("id,codigo,nome,produto_id").order("codigo");
      return (data ?? []) as Array<{ id: string; codigo: string; nome: string; produto_id: string | null }>;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!numero || !produtoId || !equipamentoId || qtdProduzida === "" || !inicio || !fim || !responsavel.trim()) {
        throw new Error("Preencha todos os campos obrigatórios");
      }
      const inicioIso = new Date(inicio).toISOString();
      const fimIso = new Date(fim).toISOString();
      if (new Date(fimIso).getTime() <= new Date(inicioIso).getTime()) {
        throw new Error("Fim deve ser posterior ao início");
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const durMin = Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000);
      const { data: inserted, error } = await supabase.from("ordens_producao").insert({
        owner_id: u.user.id,
        numero,
        produto_id: produtoId,
        equipamento_id: equipamentoId,
        qtd_planejada: qtdPlanejada === "" ? Number(qtdProduzida) : Number(qtdPlanejada),
        responsavel_fechamento: responsavel.trim(),
        finalizado_por: u.user.id,
        concentracao_media: concMedia === "" ? null : Number(concMedia),
        indice_conversao: indicePrev,
        qtd_produzida: Number(qtdProduzida),
        status: "finalizada",
        inicio_em: inicioIso,
        fim_em: fimIso,
        inicio_previsto: inicioIso,
        duracao_estimada_min: durMin,
        prioridade: "media",
        auto_iniciar: false,
        fila_posicao: null,
        obs_iniciais: obsIniciais || null,
        obs_finais: obsFinais || null,
        tanque_destino_id: tanqueId || null,
      }).select("id").single();
      if (error) throw error;
      if (lancarEstoque && tanqueId) {
        const { error: e2 } = await supabase.from("movimentacoes_estoque").insert({
          owner_id: u.user.id,
          produto_id: produtoId,
          tanque_id: tanqueId,
          tipo: "entrada",
          quantidade: Number(qtdProduzida),
          origem: `Produção OP ${numero} (manual)`,
          ordem_id: inserted!.id,
          ocorrido_em: fimIso,
        });
        if (e2) throw e2;
      }
      // Matérias-primas consumidas + baixa no estoque
      for (const m of mats) {
        const q = Number(m.qtd);
        if (!q || q <= 0) continue;
        const { error: em } = await supabase.from("ordem_materiais").insert({
          owner_id: u.user.id, ordem_id: inserted!.id, materia_prima_id: m.mp_id,
          percentual: m.percentual, quantidade_prevista: q, quantidade_consumida: q,
          tag_consumo_nome: m.tag, tanque_id: m.tanque_id || null, consumida: true,
        });
        if (em) throw em;
        if (m.tanque_id) {
          const { error: es } = await supabase.from("movimentacoes_estoque").insert({
            owner_id: u.user.id, produto_id: m.mp_id, tanque_id: m.tanque_id, tipo: "saida",
            quantidade: q, origem: `Consumo MP — OP ${numero} (manual)`, ordem_id: inserted!.id, ocorrido_em: fimIso,
          });
          if (es) throw es;
        }
      }
      try {
        const { gerarRelatorioProducaoPdf } = await import("@/lib/producao-pdf");
        await gerarRelatorioProducaoPdf(inserted!.id);
      } catch (pdfErr) {
        toast.error("Falha ao gerar PDF: " + (pdfErr as Error).message);
      }
      return inserted!.id as string;
    },
    onSuccess: () => {
      toast.success("Produção registrada manualmente");
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar produção</DialogTitle>
          <DialogDescription>
            Crie uma ordem já finalizada, para lançar produções realizadas fora do sistema (manutenção, indisponibilidade, etc.).
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
            <span>{autoLoading ? "Buscando dados do CLP…" : autoMsg || "Os dados são preenchidos pelas tags do CLP ao escolher equipamento, produto e período."}</span>
            <Button type="button" size="sm" variant="outline" disabled={autoLoading || !produtoId || !equipamentoId} onClick={() => void buscarDoClp()}>Recalcular pelo CLP</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Número da OP</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Equipamento</Label>
              <select value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)} required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— selecione —</option>
                {equipamentos.map((eq) => <option key={eq.id} value={eq.id}>{eq.codigo} — {eq.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Produto</Label>
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— selecione —</option>
                {(produtos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade planejada (opcional)</Label>
              <Input type="number" step="any" value={qtdPlanejada} placeholder="= produzida"
                onChange={(e) => setQtdPlanejada(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade produzida</Label>
              <Input type="number" step="any" value={qtdProduzida}
                onChange={(e) => setQtdProduzida(e.target.value === "" ? "" : Number(e.target.value))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tanque de destino (opcional)</Label>
              <select value={tanqueId} onChange={(e) => setTanqueId(e.target.value)}
                disabled={!produtoId}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">— sem tanque —</option>
                {(tanques.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>)}
              </select>
            </div>
            {tanqueId ? (
              <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-2">
                <div>
                  <Label className="text-sm">Lançar entrada no estoque</Label>
                  <div className="text-[11px] text-muted-foreground">Cria uma movimentação de entrada no tanque selecionado</div>
                </div>
                <Switch checked={lancarEstoque} onCheckedChange={setLancarEstoque} />
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2 rounded-md border p-2">
              <div>
                <Label className="text-sm">Matérias-primas consumidas</Label>
                <div className="text-[11px] text-muted-foreground">Sugestão pelo percentual da receita. Com tanque selecionado, dá baixa no estoque.</div>
              </div>
              {!produtoId ? <div className="text-xs text-muted-foreground">Selecione o produto.</div>
                : mats.length === 0 ? <div className="text-xs text-muted-foreground">Produto sem receita cadastrada.</div>
                : mats.map((m, i) => (
                  <div key={m.mp_id} className="grid gap-2 sm:grid-cols-[1fr_120px_1fr] items-center">
                    <div className="text-sm">{m.nome}{m.percentual != null ? <span className="text-xs text-muted-foreground"> · {m.percentual}%</span> : null}
                      {i === 0 ? <Badge variant="outline" className="ml-1 text-[10px]">Base do índice</Badge> : null}
                      {m.tag ? <div className="text-[10px] text-muted-foreground font-mono">tag {m.tag}</div> : null}</div>
                    <Input type="number" step="any" value={m.qtd} placeholder={m.unidade || "qtd"}
                      onChange={(e) => setMats((prev) => prev.map((x, j) => j === i ? { ...x, qtd: e.target.value } : x))} />
                    <select value={m.tanque_id}
                      onChange={(e) => setMats((prev) => prev.map((x, j) => j === i ? { ...x, tanque_id: e.target.value } : x))}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                      <option value="">— sem baixa —</option>
                      {(tanquesMp.data ?? []).filter((t) => !t.produto_id || t.produto_id === m.mp_id)
                        .map((t) => <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>)}
                    </select>
                  </div>
                ))}
            </div>
            <div className="space-y-1.5">
              <Label>Concentração média do período (%)</Label>
              <Input type="number" step="any" value={concMedia} onChange={(e) => setConcMedia(e.target.value)} placeholder={concCad != null ? String(concCad) : "ex.: 52"} />
              <p className="text-[11px] text-muted-foreground">Cadastrada no produto: {concCad != null ? `${concCad}%` : "—"}</p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="text-[11px] text-muted-foreground">Índice de conversão (prévia)</div>
              <div className="text-xl font-semibold tabular-nums">{indicePrev != null ? indicePrev.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "—"}</div>
              <div className="text-[10px] text-muted-foreground">(1ª MP ÷ produzido) × conc. cad. ÷ conc. média</div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Responsável pelo fechamento</Label>
              <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} required />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações iniciais</Label>
              <textarea value={obsIniciais} onChange={(e) => setObsIniciais(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações finais</Label>
              <textarea value={obsFinais} onChange={(e) => setObsFinais(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Registrar como finalizada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
