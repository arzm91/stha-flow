import { pageHead } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Play,
  Square,
  Gauge,
  FlaskConical,
  MessageSquare,
  AlertOctagon,
  Package,
  ArrowDownToLine,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { formatDate, formatNumber, durationBetween } from "@/lib/format";
import { gerarRelatorioProducaoPdf } from "@/lib/producao-pdf";
import { gerarRelatorioProducaoXlsx } from "@/lib/producao-xlsx";
import { toast } from "sonner";
import { TrocasProdutoList } from "@/components/producao/TrocasProdutoList";
import { Repeat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/producao/finalizada/$id")({
  head: pageHead({
    title: "Produção · Detalhes da OP finalizada — STHApc",
    description: "Visualize os detalhes e a linha do tempo de eventos de uma ordem de produção finalizada no STHApc.",
    path: (params) => `/producao/finalizada/${params.id}`,
  }),
  component: FinalizadaPage,
});

type OpRow = {
  id: string;
  numero: string;
  status: string;
  qtd_planejada: number;
  qtd_produzida: number | null;
  inicio_em: string | null;
  fim_em: string | null;
  inicio_previsto: string | null;
  obs_iniciais: string | null;
  obs_finais: string | null;
  equipamento_id: string;
  produto_id: string | null;
  owner_id: string;
  produto: { nome: string; codigo: string; unidade: string | null } | null;
  equipamento: { nome: string; codigo: string } | null;
  tanque: { nome: string; codigo: string } | null;
};

type Evento = {
  when: string;
  tipo: "inicio" | "fim" | "parametro" | "analise" | "observacao" | "parada" | "material" | "movimentacao" | "troca";
  titulo: string;
  descricao?: string;
  meta?: string;
};

const TIPO_META: Record<
  Evento["tipo"],
  { label: string; icon: any; color: string }
> = {
  inicio: { label: "Início", icon: Play, color: "bg-primary/15 text-primary border-primary/30" },
  fim: { label: "Fim", icon: Square, color: "bg-success/15 text-success border-success/30" },
  parametro: { label: "Parâmetro", icon: Gauge, color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  analise: { label: "Análise", icon: FlaskConical, color: "bg-purple-500/15 text-purple-500 border-purple-500/30" },
  observacao: { label: "Observação", icon: MessageSquare, color: "bg-muted text-foreground border-border" },
  parada: { label: "Parada", icon: AlertOctagon, color: "bg-destructive/15 text-destructive border-destructive/30" },
  material: { label: "Material", icon: Package, color: "bg-warning/15 text-warning border-warning/30" },
  movimentacao: { label: "Estoque", icon: ArrowDownToLine, color: "bg-success/15 text-success border-success/30" },
  troca: { label: "Troca de produto", icon: Repeat, color: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
};

function FinalizadaPage() {
  const { id } = Route.useParams();

  const op = useQuery({
    queryKey: ["op-finalizada", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_producao")
        .select(
          "id,numero,status,qtd_planejada,qtd_produzida,inicio_em,fim_em,inicio_previsto,obs_iniciais,obs_finais,equipamento_id,produto_id,owner_id, produto:produto_id(nome,codigo,unidade), equipamento:equipamento_id(nome,codigo), tanque:tanque_destino_id(nome,codigo)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as OpRow | null;
    },
  });

  const operador = useQuery({
    queryKey: ["operador-final", op.data?.owner_id],
    enabled: !!op.data?.owner_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nome,email").eq("id", op.data!.owner_id).maybeSingle();
      return data;
    },
  });

  const parametros = useQuery({
    queryKey: ["params-final", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("parametros_registrados")
        .select("id, registrado_em, valor, parametro:parametro_id(nome,unidade)")
        .eq("ordem_id", id);
      return data ?? [];
    },
  });

  const analises = useQuery({
    queryKey: ["anls-final", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("analises_registradas")
        .select("id, registrado_em, valor, analise:analise_id(nome,unidade)")
        .eq("ordem_id", id);
      return data ?? [];
    },
  });

  const observacoes = useQuery({
    queryKey: ["obs-final", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("observacoes_producao")
        .select("id, texto, registrado_em")
        .eq("ordem_id", id);
      return data ?? [];
    },
  });

  const paradas = useQuery({
    queryKey: ["paradas-final", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("paradas_equipamento")
        .select("id, motivo, categoria, observacao, inicio_em, fim_em, duracao_seg, status")
        .eq("ordem_producao_id", id);
      return data ?? [];
    },
  });

  const materiais = useQuery({
    queryKey: ["mats-final", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ordem_materiais")
        .select("id, materia_prima_id, quantidade_prevista, quantidade_consumida, consumida, updated_at, materia:materia_prima_id(nome,unidade)")
        .eq("ordem_id", id);
      return (data ?? []) as any[];
    },
  });

  const movimentacoes = useQuery({
    queryKey: ["movs-final", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("movimentacoes_estoque")
        .select("id, tipo, quantidade, origem, destino, ocorrido_em, produto:produto_id(nome,unidade), tanque:tanque_id(codigo,nome)")
        .eq("ordem_id", id);
      return (data ?? []) as any[];
    },
  });

  const trocas = useQuery({
    queryKey: ["trocas-final", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ordem_trocas_produto")
        .select("id, ocorrido_em, qtd_produto_anterior, produto_anterior:produto_anterior_id(nome,unidade), produto_novo:produto_novo_id(nome)")
        .eq("ordem_id", id);
      return (data ?? []) as any[];
    },
  });

  const eventos = useMemo<Evento[]>(() => {
    if (!op.data) return [];
    const evs: Evento[] = [];
    if (op.data.inicio_em) {
      evs.push({
        when: op.data.inicio_em,
        tipo: "inicio",
        titulo: "Início da produção",
        descricao: op.data.obs_iniciais || undefined,
      });
    }
    for (const p of parametros.data ?? []) {
      const cat = (p as any).parametro;
      evs.push({
        when: (p as any).registrado_em,
        tipo: "parametro",
        titulo: cat?.nome ?? "Parâmetro",
        descricao: `${formatNumber(Number((p as any).valor))} ${cat?.unidade ?? ""}`.trim(),
      });
    }
    for (const a of analises.data ?? []) {
      const cat = (a as any).analise;
      evs.push({
        when: (a as any).registrado_em,
        tipo: "analise",
        titulo: cat?.nome ?? "Análise",
        descricao: `${formatNumber(Number((a as any).valor))} ${cat?.unidade ?? ""}`.trim(),
      });
    }
    for (const o of observacoes.data ?? []) {
      evs.push({
        when: (o as any).registrado_em,
        tipo: "observacao",
        titulo: "Observação",
        descricao: (o as any).texto,
      });
    }
    for (const p of paradas.data ?? []) {
      const dur = (p as any).duracao_seg
        ? `${Math.round(Number((p as any).duracao_seg) / 60)} min`
        : (p as any).fim_em
          ? durationBetween((p as any).inicio_em, (p as any).fim_em)
          : "em curso";
      evs.push({
        when: (p as any).inicio_em,
        tipo: "parada",
        titulo: `Parada: ${(p as any).motivo ?? "sem motivo"}`,
        descricao: (p as any).observacao || undefined,
        meta: `${(p as any).categoria ?? ""} · ${dur}`,
      });
    }
    for (const m of materiais.data ?? []) {
      if (!m.consumida && !m.quantidade_consumida) continue;
      evs.push({
        when: m.updated_at,
        tipo: "material",
        titulo: `Consumo: ${m.materia?.nome ?? "Matéria-prima"}`,
        descricao: `${formatNumber(Number(m.quantidade_consumida ?? 0))} ${m.materia?.unidade ?? ""} (previsto ${formatNumber(Number(m.quantidade_prevista ?? 0))})`,
      });
    }
    for (const mv of movimentacoes.data ?? []) {
      evs.push({
        when: mv.ocorrido_em,
        tipo: "movimentacao",
        titulo: `${mv.tipo === "entrada" ? "Entrada" : "Saída"} de estoque`,
        descricao: `${formatNumber(Number(mv.quantidade))} ${mv.produto?.unidade ?? ""} · ${mv.produto?.nome ?? ""}${mv.tanque ? ` → ${mv.tanque.codigo}` : ""}`,
        meta: mv.origem || mv.destino || undefined,
      });
    }
    for (const t of trocas.data ?? []) {
      evs.push({
        when: t.ocorrido_em,
        tipo: "troca",
        titulo: `Troca: ${t.produto_anterior?.nome ?? "—"} → ${t.produto_novo?.nome ?? "—"}`,
        descricao: `${formatNumber(Number(t.qtd_produto_anterior))} ${t.produto_anterior?.unidade ?? ""} produzidos do anterior`.trim(),
      });
    }
    if (op.data.fim_em) {
      evs.push({
        when: op.data.fim_em,
        tipo: "fim",
        titulo: "Fim da produção",
        descricao: op.data.obs_finais || undefined,
      });
    }
    evs.sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());
    return evs;
  }, [op.data, parametros.data, analises.data, observacoes.data, paradas.data, materiais.data, movimentacoes.data, trocas.data]);

  if (op.isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!op.data) return <div className="text-sm text-muted-foreground">Ordem não encontrada.</div>;

  const o = op.data;
  const duracaoTotal = o.inicio_em && o.fim_em ? durationBetween(o.inicio_em, o.fim_em) : "—";
  const produtoNome = o.produto?.nome ?? "—";
  const equipNome = o.equipamento?.nome ?? "—";

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/producao/pcp"><ArrowLeft className="mr-1 h-4 w-4" />Voltar para PCP</Link>
      </Button>
      <PageHeader
        title={`OP ${o.numero}`}
        description={`${produtoNome} · ${equipNome}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-success/30 bg-success/15 text-success">Finalizada</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try { await gerarRelatorioProducaoPdf(id); toast.success("Relatório PDF gerado"); }
                catch (e) { toast.error("Falha ao gerar PDF: " + (e as Error).message); }
              }}
            >
              <FileText className="mr-1 h-4 w-4" />Relatório PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try { await gerarRelatorioProducaoXlsx(id); toast.success("Excel gerado"); }
                catch (e) { toast.error("Falha ao gerar Excel: " + (e as Error).message); }
              }}
            >
              <FileSpreadsheet className="mr-1 h-4 w-4" />Exportar Excel
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        <Info label="Início" value={formatDate(o.inicio_em)} />
        <Info label="Fim" value={formatDate(o.fim_em)} />
        <Info label="Duração total" value={duracaoTotal} />
        <Info
          label="Qtd. planejada / produzida"
          value={`${formatNumber(Number(o.qtd_planejada))} / ${o.qtd_produzida != null ? formatNumber(Number(o.qtd_produzida)) : "—"} ${o.produto?.unidade ?? ""}`.trim()}
        />
        <Info label="Operador" value={operador.data?.nome ?? "—"} />
        <Info label="Tanque destino" value={o.tanque ? `${o.tanque.codigo} · ${o.tanque.nome}` : "—"} />
      </div>

      {(o.obs_iniciais || o.obs_finais) ? (
        <Card className="mb-4">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2">
            {o.obs_iniciais ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Observações iniciais</div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{o.obs_iniciais}</div>
              </div>
            ) : null}
            {o.obs_finais ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Observações finais</div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{o.obs_finais}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Linha do tempo de eventos</h2>
            <Badge variant="outline">{eventos.length} eventos</Badge>
          </div>
          {eventos.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum evento registrado para esta ordem.
            </div>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-6">
              {eventos.map((ev, i) => {
                const meta = TIPO_META[ev.tipo];
                const Icon = meta.icon;
                return (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full border ${meta.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                      <span className="text-sm font-medium">{ev.titulo}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(ev.when)}</span>
                    </div>
                    {ev.descricao ? (
                      <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{ev.descricao}</div>
                    ) : null}
                    {ev.meta ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">{ev.meta}</div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-sm font-medium">{value}</div>
      </CardContent>
    </Card>
  );
}
