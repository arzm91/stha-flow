import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KpiCard, SectionTitle, DataTable, StatusBadge, SeverityBadge, HBarChart } from "./atoms";
import { ReportShell } from "./ReportShell";
import {
  fetchEstoqueTotal, fetchProdutividadeTotal, fetchProdutividadeEquip,
  fetchMensal, fetchManutencao24h, fetchOsManutencao, fetchOrdemProducao,
  fetchAlertas24h, listOsManutencao, listOrdensProducao,
} from "@/lib/reports-v2/data.functions";
import { REPORTS } from "@/lib/reports-v2/registry";
import { formatDate, formatNumber, formatInt } from "@/lib/format";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { ReportSlug } from "@/lib/reports-v2/types";

// -------- utils --------
const nf = (n: any, d = 2) => formatNumber(Number(n ?? 0), d);
const ni = (n: any) => formatInt(Number(n ?? 0));
const fd = (d: any) => (d ? formatDate(d) : "—");
const periodoMes = () => {
  const d = new Date();
  return `01/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} – ${d.toLocaleDateString("pt-BR")}`;
};

// ================================================
// 1) ESTOQUE TOTAL
// ================================================
export function EstoqueTotalReport() {
  const fn = useServerFn(fetchEstoqueTotal);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["rep-estoque-total"], queryFn: () => fn() });
  const meta = REPORTS["estoque-total"];
  if (isLoading || !data) return <ReportShell title={meta.titulo} accent={meta.cor}><div className="p-8 text-center text-slate-500">Carregando…</div></ReportShell>;
  const criticos = data.linhas.filter((l: any) => l.diasCobertura !== null && l.diasCobertura < 7).sort((a: any, b: any) => a.diasCobertura - b.diasCobertura);
  return (
    <ReportShell title={meta.titulo} subtitle={meta.descricao} accent={meta.cor} periodo="Últimos 30 dias" onRefresh={refetch}>
      <div className="grid grid-cols-4 gap-3 break-avoid">
        <KpiCard label="Produtos ativos" value={ni(data.kpis.totalProdutos)} tone="primary" />
        <KpiCard label="Entradas 30d" value={nf(data.kpis.totalEntradas30d)} tone="success" hint={`${nf(data.kpis.ent24)} nas últimas 24h`} />
        <KpiCard label="Saídas 30d" value={nf(data.kpis.totalSaidas30d)} tone="warning" hint={`${nf(data.kpis.sai24)} nas últimas 24h`} />
        <KpiCard label="Estoque crítico" value={ni(data.kpis.criticos)} tone="danger" hint="Cobertura < 7 dias" />
      </div>

      {criticos.length > 0 && (
        <>
          <SectionTitle accent={meta.cor}>Alertas de reposição</SectionTitle>
          <DataTable rows={criticos.slice(0, 10)}
            columns={[
              { header: "Produto", cell: (r: any) => <span className="font-medium">{r.nome}</span> },
              { header: "Saldo", align: "right", cell: (r: any) => `${nf(r.saldoAtual)} ${r.unidade || ""}` },
              { header: "Consumo/dia", align: "right", cell: (r: any) => nf(r.consumoDiario) },
              { header: "Dias cobertura", align: "right", cell: (r: any) => <span className="font-bold text-red-700">{r.diasCobertura?.toFixed(1) ?? "—"}</span> },
              { header: "Projetado 7d", align: "right", cell: (r: any) => nf(r.projetado7d) },
            ]}
          />
        </>
      )}

      <SectionTitle accent={meta.cor}>Estoque por produto</SectionTitle>
      <DataTable rows={data.linhas}
        columns={[
          { header: "Código", cell: (r: any) => <span className="font-mono text-[10px]">{r.codigo}</span> },
          { header: "Produto", cell: (r: any) => r.nome },
          { header: "Un.", cell: (r: any) => r.unidade },
          { header: "Entradas 30d", align: "right", cell: (r: any) => nf(r.entradas30d) },
          { header: "Saídas 30d", align: "right", cell: (r: any) => nf(r.saidas30d) },
          { header: "Saldo", align: "right", cell: (r: any) => <span className="font-bold">{nf(r.saldoAtual)}</span> },
          { header: "Cobertura", align: "right", cell: (r: any) => r.diasCobertura !== null ? `${r.diasCobertura.toFixed(1)}d` : "—" },
        ]}
      />
    </ReportShell>
  );
}

// ================================================
// 2) PRODUTIVIDADE TOTAL
// ================================================
export function ProdutividadeTotalReport() {
  const fn = useServerFn(fetchProdutividadeTotal);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["rep-prod-total"], queryFn: () => fn() });
  const meta = REPORTS["produtividade-total"];
  if (isLoading || !data) return <ReportShell title={meta.titulo} accent={meta.cor}><div className="p-8 text-center text-slate-500">Carregando…</div></ReportShell>;
  return (
    <ReportShell title={meta.titulo} subtitle={meta.descricao} accent={meta.cor} periodo={periodoMes()} onRefresh={refetch}>
      <div className="grid grid-cols-5 gap-3 break-avoid">
        <KpiCard label="Equipamentos ativos" value={ni(data.kpis.totalEquip)} tone="primary" />
        <KpiCard label="Produção do mês" value={nf(data.kpis.producaoMes)} tone="success" />
        <KpiCard label="Ordens do mês" value={ni(data.kpis.ordensMes)} />
        <KpiCard label="Finalizadas" value={ni(data.kpis.finalizadasMes)} tone="success" />
        <KpiCard label="Em andamento" value={ni(data.kpis.emAndamento)} tone="warning" />
      </div>

      <SectionTitle accent={meta.cor}>Por equipamento</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.equipamentos.map((e: any) => (
          <div key={e.id} className="break-avoid rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-500">{e.codigo}</div>
                <div className="text-sm font-bold text-slate-900">{e.nome}</div>
                <div className="text-[11px] text-slate-500">{e.tipo}</div>
              </div>
              <StatusBadge status={e.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div><div className="text-slate-500">Total mês</div><div className="text-lg font-bold text-blue-700">{nf(e.totalMes)}</div></div>
              <div><div className="text-slate-500">Finalizadas</div><div className="text-lg font-bold text-emerald-700">{e.finalizadasMes}</div></div>
            </div>
            {e.ultima ? (
              <div className="mt-3 rounded bg-slate-50 p-2 text-[11px]">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold">Última: {e.ultima.numero}</span>
                  <StatusBadge status={e.ultima.status} />
                </div>
                <div className="text-slate-700">{e.ultima.produto}</div>
                <div className="mt-1 text-slate-500">Produzida: <span className="font-mono font-semibold text-slate-800">{nf(e.ultima.qtd)} {e.ultima.unidade}</span> / Planejada: {nf(e.ultima.planejada)}</div>
                <div className="text-slate-500">Fim: {fd(e.ultima.fim)}</div>
              </div>
            ) : <div className="mt-3 text-[11px] italic text-slate-400">Sem produções no mês</div>}
          </div>
        ))}
      </div>

      <SectionTitle accent={meta.cor}>Estoque atual (top 30)</SectionTitle>
      <DataTable rows={data.estoque}
        columns={[
          { header: "Produto", cell: (r: any) => r.nome },
          { header: "Unidade", cell: (r: any) => r.unidade },
          { header: "Saldo", align: "right", cell: (r: any) => <span className="font-bold">{nf(r.saldo)}</span> },
        ]}
      />
    </ReportShell>
  );
}

// ================================================
// 3) PRODUTIVIDADE POR EQUIPAMENTO
// ================================================
export function ProdutividadeEquipReport({ equipamentoId, ordemId }: { equipamentoId?: string; ordemId?: string }) {
  const [selected, setSelected] = useState<string | undefined>(equipamentoId);
  const meta = REPORTS["produtividade-equipamento"];

  const { data: equips } = useQuery({
    queryKey: ["equips-picker"],
    queryFn: async () => {
      const { data } = await supabase.from("equipamentos").select("id, nome, codigo").eq("ativo", true).order("nome");
      return data ?? [];
    },
  });

  const fn = useServerFn(fetchProdutividadeEquip);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rep-prod-equip", selected, ordemId],
    queryFn: () => fn({ data: { equipamentoId: selected!, ordemId } }),
    enabled: !!selected,
  });

  const actions = (
    <Select value={selected} onValueChange={setSelected}>
      <SelectTrigger className="w-64"><SelectValue placeholder="Selecione o equipamento" /></SelectTrigger>
      <SelectContent>
        {(equips ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  if (!selected) return <ReportShell title={meta.titulo} accent={meta.cor} actions={actions}><div className="p-8 text-center text-slate-500">Selecione um equipamento no topo.</div></ReportShell>;
  if (isLoading || !data) return <ReportShell title={meta.titulo} accent={meta.cor} actions={actions}><div className="p-8 text-center text-slate-500">Carregando…</div></ReportShell>;

  return (
    <ReportShell title={meta.titulo} subtitle={data.equip.nome} accent={meta.cor} periodo={periodoMes()} onRefresh={refetch} actions={actions}>
      <div className="grid grid-cols-4 gap-3 break-avoid">
        <KpiCard label="Total mês" value={nf(data.kpis.totalMes)} tone="primary" />
        <KpiCard label="Ordens" value={ni(data.kpis.ordensMes)} />
        <KpiCard label="Finalizadas" value={ni(data.kpis.finalizadasMes)} tone="success" />
        <KpiCard label="Eficiência última" value={data.kpis.eficienciaUltima !== null ? `${data.kpis.eficienciaUltima.toFixed(1)}%` : "—"} tone={data.kpis.eficienciaUltima && data.kpis.eficienciaUltima >= 95 ? "success" : "warning"} />
      </div>

      {data.ultima && (
        <>
          <SectionTitle accent={meta.cor}>Última produção — destaque</SectionTitle>
          <div className="break-avoid rounded-lg border-2 p-5" style={{ borderColor: meta.cor }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-500">Ordem</div>
                <div className="text-xl font-bold">{data.ultima.numero}</div>
                {data.ultima.produto && <div className="text-sm text-slate-700">{data.ultima.produto.nome}</div>}
              </div>
              <StatusBadge status={data.ultima.status} />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
              <div><div className="text-slate-500">Planejada</div><div className="text-lg font-bold">{nf(data.ultima.qtd_planejada)}</div></div>
              <div><div className="text-slate-500">Produzida</div><div className="text-lg font-bold text-blue-700">{nf(data.ultima.qtd_produzida)}</div></div>
              <div><div className="text-slate-500">Início</div><div className="text-sm">{fd(data.ultima.inicio_em)}</div></div>
              <div><div className="text-slate-500">Fim</div><div className="text-sm">{fd(data.ultima.fim_em)}</div></div>
            </div>
            {data.ultima.obs_finais && <div className="mt-3 rounded bg-slate-50 p-2 text-xs"><span className="font-semibold">Observações: </span>{data.ultima.obs_finais}</div>}
          </div>

          <SectionTitle accent={meta.cor}>Matérias-primas consumidas</SectionTitle>
          <DataTable rows={data.materiais}
            columns={[
              { header: "Matéria-prima", cell: (r: any) => <><span className="font-mono text-[10px] text-slate-500">{r.codigo}</span> {r.nome}</> },
              { header: "%", align: "right", cell: (r: any) => `${nf(r.percentual, 1)}%` },
              { header: "Prevista", align: "right", cell: (r: any) => `${nf(r.prevista)} ${r.unidade}` },
              { header: "Consumida", align: "right", cell: (r: any) => <span className="font-bold">{nf(r.consumida)} {r.unidade}</span> },
              { header: "Δ", align: "right", cell: (r: any) => nf(r.consumida - r.prevista) },
            ]}
          />
        </>
      )}

      <SectionTitle accent={meta.cor}>Histórico do mês</SectionTitle>
      <DataTable rows={data.historico}
        columns={[
          { header: "OP", cell: (r: any) => r.numero },
          { header: "Produto", cell: (r: any) => r.produto },
          { header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
          { header: "Planejada", align: "right", cell: (r: any) => nf(r.planejada) },
          { header: "Produzida", align: "right", cell: (r: any) => <span className="font-semibold">{nf(r.produzida)}</span> },
          { header: "Fim", cell: (r: any) => fd(r.fim) },
        ]}
      />
    </ReportShell>
  );
}

// ================================================
// 4) MENSAL CONSOLIDADO
// ================================================
export function MensalReport() {
  const [equip, setEquip] = useState<string | undefined>();
  const fn = useServerFn(fetchMensal);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["rep-mensal", equip], queryFn: () => fn({ data: { equipamentoId: equip } }) });
  const meta = REPORTS["mensal"];
  const actions = (
    <Select value={equip ?? "all"} onValueChange={(v) => setEquip(v === "all" ? undefined : v)}>
      <SelectTrigger className="w-56"><SelectValue placeholder="Filtrar por equipamento" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os equipamentos</SelectItem>
        {(data?.equipamentos ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  if (isLoading || !data) return <ReportShell title={meta.titulo} accent={meta.cor} actions={actions}><div className="p-8 text-center">Carregando…</div></ReportShell>;
  const eficiencia = data.kpis.totalPlanejado > 0 ? (data.kpis.totalProduzido / data.kpis.totalPlanejado * 100) : 0;
  return (
    <ReportShell title={meta.titulo} subtitle={meta.descricao} accent={meta.cor} periodo={periodoMes()} onRefresh={refetch} actions={actions}>
      <div className="grid grid-cols-5 gap-3 break-avoid">
        <KpiCard label="Total ordens" value={ni(data.kpis.totalOrdens)} tone="primary" />
        <KpiCard label="Produzido" value={nf(data.kpis.totalProduzido)} tone="success" />
        <KpiCard label="Planejado" value={nf(data.kpis.totalPlanejado)} />
        <KpiCard label="Eficiência" value={`${eficiencia.toFixed(1)}%`} tone={eficiencia >= 95 ? "success" : "warning"} />
        <KpiCard label="Em andamento" value={ni(data.kpis.emAndamento)} tone="warning" />
      </div>

      {data.grupos.map((g: any, i: number) => (
        <div key={i} className="break-avoid">
          <SectionTitle accent={meta.cor}>{g.equip.nome}{g.equip.codigo ? ` · ${g.equip.codigo}` : ""}</SectionTitle>
          <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded border bg-slate-50 p-2"><div className="text-slate-500">Produzido</div><div className="text-lg font-bold text-blue-700">{nf(g.totalMes)}</div></div>
            <div className="rounded border bg-slate-50 p-2"><div className="text-slate-500">Ordens</div><div className="text-lg font-bold">{g.ordens.length}</div></div>
            <div className="rounded border bg-slate-50 p-2"><div className="text-slate-500">Finalizadas</div><div className="text-lg font-bold text-emerald-700">{g.finalizadas}</div></div>
          </div>
          <DataTable rows={g.ordens}
            columns={[
              { header: "OP", cell: (r: any) => r.numero },
              { header: "Produto", cell: (r: any) => r.produto },
              { header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
              { header: "Plan.", align: "right", cell: (r: any) => nf(r.planejada) },
              { header: "Prod.", align: "right", cell: (r: any) => <span className="font-semibold">{nf(r.produzida)}</span> },
              { header: "Fim", cell: (r: any) => fd(r.fim) },
            ]}
          />
        </div>
      ))}
    </ReportShell>
  );
}

// ================================================
// 5) MANUTENÇÃO 24h + PROGRAMADAS
// ================================================
export function Manutencao24hReport() {
  const fn = useServerFn(fetchManutencao24h);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["rep-man-24h"], queryFn: () => fn() });
  const meta = REPORTS["manutencao-24h"];
  if (isLoading || !data) return <ReportShell title={meta.titulo} accent={meta.cor}><div className="p-8 text-center">Carregando…</div></ReportShell>;
  return (
    <ReportShell title={meta.titulo} subtitle={meta.descricao} accent={meta.cor} periodo="Últimas 24h" onRefresh={refetch}>
      <div className="grid grid-cols-4 gap-3 break-avoid">
        <KpiCard label="Realizadas 24h" value={ni(data.kpis.realizadas24h)} tone="success" />
        <KpiCard label="Programadas" value={ni(data.kpis.programadas)} tone="primary" />
        <KpiCard label="Críticas pendentes" value={ni(data.kpis.criticas)} tone="danger" />
        <KpiCard label="Custo 24h" value={`R$ ${nf(data.kpis.custoTotal24h)}`} />
      </div>

      <SectionTitle accent={meta.cor}>Realizadas nas últimas 24h</SectionTitle>
      <DataTable rows={data.realizadas} empty="Nenhuma manutenção realizada nas últimas 24h"
        columns={[
          { header: "OS", cell: (r: any) => <span className="font-mono">{r.numero}</span> },
          { header: "Equipamento", cell: (r: any) => r.equipamento },
          { header: "Tipo", cell: (r: any) => r.tipo },
          { header: "Prioridade", cell: (r: any) => r.prioridade },
          { header: "Responsável", cell: (r: any) => r.responsavel ?? "—" },
          { header: "Conclusão", cell: (r: any) => fd(r.data_conclusao) },
          { header: "Custo", align: "right", cell: (r: any) => `R$ ${nf(r.custo)}` },
        ]}
      />

      <SectionTitle accent={meta.cor}>Programadas</SectionTitle>
      <DataTable rows={data.programadas} empty="Sem manutenções programadas"
        columns={[
          { header: "OS", cell: (r: any) => <span className="font-mono">{r.numero}</span> },
          { header: "Equipamento", cell: (r: any) => r.equipamento },
          { header: "Tipo", cell: (r: any) => r.tipo },
          { header: "Prioridade", cell: (r: any) => <span className={r.prioridade === "alta" || r.prioridade === "critica" ? "font-bold text-red-700" : ""}>{r.prioridade}</span> },
          { header: "Agendada", cell: (r: any) => fd(r.agendada_para) },
          { header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
        ]}
      />
    </ReportShell>
  );
}

// ================================================
// 6) ORDEM DE SERVIÇO DE MANUTENÇÃO
// ================================================
export function OsManutencaoReport({ id }: { id?: string }) {
  const [selected, setSelected] = useState<string | undefined>(id);
  const meta = REPORTS["os-manutencao"];
  const listFn = useServerFn(listOsManutencao);
  const { data: lista } = useQuery({ queryKey: ["os-man-list"], queryFn: () => listFn() });
  const fn = useServerFn(fetchOsManutencao);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rep-os-man", selected], queryFn: () => fn({ data: { id: selected! } }), enabled: !!selected,
  });
  const actions = (
    <Select value={selected} onValueChange={setSelected}>
      <SelectTrigger className="w-64"><SelectValue placeholder="Selecione a OS" /></SelectTrigger>
      <SelectContent>
        {(lista ?? []).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.numero} · {o.status}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  if (!selected) return <ReportShell title={meta.titulo} accent={meta.cor} actions={actions}><div className="p-8 text-center text-slate-500">Selecione uma ordem de serviço.</div></ReportShell>;
  if (isLoading || !data) return <ReportShell title={meta.titulo} accent={meta.cor} actions={actions}><div className="p-8 text-center">Carregando…</div></ReportShell>;
  const os = data.os;
  return (
    <ReportShell title={`OS ${os.numero}`} subtitle={data.equipamento?.nome ?? "—"} accent={meta.cor} onRefresh={refetch} actions={actions}>
      <div className="grid grid-cols-4 gap-3 break-avoid">
        <KpiCard label="Tipo" value={os.tipo} />
        <KpiCard label="Prioridade" value={os.prioridade} tone={os.prioridade === "alta" || os.prioridade === "critica" ? "danger" : "default"} />
        <KpiCard label="Status" value={<StatusBadge status={os.status} />} />
        <KpiCard label="Custo" value={`R$ ${nf(os.custo)}`} />
      </div>

      <SectionTitle accent={meta.cor}>Equipamento</SectionTitle>
      <div className="rounded-lg border bg-slate-50 p-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-slate-500">Código: </span><span className="font-mono font-semibold">{data.equipamento?.codigo ?? "—"}</span></div>
          <div><span className="text-slate-500">Nome: </span><span className="font-semibold">{data.equipamento?.nome ?? "—"}</span></div>
          <div><span className="text-slate-500">Tipo: </span>{data.equipamento?.tipo ?? "—"}</div>
          <div><span className="text-slate-500">Localização: </span>{data.equipamento?.localizacao ?? "—"}</div>
        </div>
      </div>

      <SectionTitle accent={meta.cor}>Dados da OS</SectionTitle>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Abertura</div><div className="font-semibold">{fd(os.data_abertura)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Agendada para</div><div className="font-semibold">{fd(os.agendada_para)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Início</div><div className="font-semibold">{fd(os.data_inicio)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Conclusão</div><div className="font-semibold">{fd(os.data_conclusao)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Responsável</div><div className="font-semibold">{os.responsavel ?? "—"}</div></div>
      </div>

      {os.descricao_problema && (
        <>
          <SectionTitle accent={meta.cor}>Descrição do problema</SectionTitle>
          <div className="rounded border bg-white p-3 text-sm whitespace-pre-wrap">{os.descricao_problema}</div>
        </>
      )}

      {data.atividades.length > 0 && (
        <>
          <SectionTitle accent={meta.cor}>Checklist de atividades</SectionTitle>
          <DataTable rows={data.atividades}
            columns={[
              { header: "#", cell: (r: any) => r.ordem_seq },
              { header: "Atividade", cell: (r: any) => r.descricao },
              { header: "Realizada", align: "center", cell: (r: any) => r.realizada ? "☑" : "☐" },
              { header: "Observação", cell: (r: any) => r.observacao ?? "" },
            ]}
          />
        </>
      )}

      {os.descricao_servico && (
        <>
          <SectionTitle accent={meta.cor}>Serviço executado</SectionTitle>
          <div className="rounded border bg-white p-3 text-sm whitespace-pre-wrap">{os.descricao_servico}</div>
        </>
      )}

      {os.pecas_utilizadas && (
        <>
          <SectionTitle accent={meta.cor}>Peças utilizadas</SectionTitle>
          <div className="rounded border bg-white p-3 text-sm whitespace-pre-wrap">{os.pecas_utilizadas}</div>
        </>
      )}

      <div className="mt-8 grid grid-cols-2 gap-8 break-avoid">
        <div className="border-t-2 border-slate-400 pt-1 text-center text-xs">Técnico Responsável</div>
        <div className="border-t-2 border-slate-400 pt-1 text-center text-xs">Supervisor</div>
      </div>
    </ReportShell>
  );
}

// ================================================
// 7) ORDEM DE PRODUÇÃO
// ================================================
export function OrdemProducaoReport({ id }: { id?: string }) {
  const [selected, setSelected] = useState<string | undefined>(id);
  const meta = REPORTS["ordem-producao"];
  const listFn = useServerFn(listOrdensProducao);
  const { data: lista } = useQuery({ queryKey: ["op-list"], queryFn: () => listFn() });
  const fn = useServerFn(fetchOrdemProducao);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rep-op", selected], queryFn: () => fn({ data: { id: selected! } }), enabled: !!selected,
  });
  const actions = (
    <Select value={selected} onValueChange={setSelected}>
      <SelectTrigger className="w-64"><SelectValue placeholder="Selecione a OP" /></SelectTrigger>
      <SelectContent>
        {(lista ?? []).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.numero} · {o.status}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  if (!selected) return <ReportShell title={meta.titulo} accent={meta.cor} actions={actions}><div className="p-8 text-center text-slate-500">Selecione uma ordem de produção.</div></ReportShell>;
  if (isLoading || !data) return <ReportShell title={meta.titulo} accent={meta.cor} actions={actions}><div className="p-8 text-center">Carregando…</div></ReportShell>;
  const op = data.op;
  return (
    <ReportShell title={`OP ${op.numero}`} subtitle={data.produto?.nome ?? "—"} accent={meta.cor} onRefresh={refetch} actions={actions}>
      <div className="grid grid-cols-4 gap-3 break-avoid">
        <KpiCard label="Status" value={<StatusBadge status={op.status} />} />
        <KpiCard label="Planejada" value={`${nf(op.qtd_planejada)} ${data.produto?.unidade ?? ""}`} />
        <KpiCard label="Produzida" value={`${nf(op.qtd_produzida)} ${data.produto?.unidade ?? ""}`} tone="primary" />
        <KpiCard label="Prioridade" value={op.prioridade ?? "média"} />
      </div>

      <SectionTitle accent={meta.cor}>Identificação</SectionTitle>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Equipamento</div><div className="font-semibold">{data.equipamento?.codigo} · {data.equipamento?.nome}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Produto</div><div className="font-semibold">{data.produto?.codigo} · {data.produto?.nome}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Início previsto</div><div className="font-semibold">{fd(op.inicio_previsto)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Início real</div><div className="font-semibold">{fd(op.inicio_em)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Fim real</div><div className="font-semibold">{fd(op.fim_em)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-slate-500">Duração estimada</div><div className="font-semibold">{op.duracao_estimada_min ? `${op.duracao_estimada_min} min` : "—"}</div></div>
      </div>

      {op.obs_iniciais && (<><SectionTitle accent={meta.cor}>Observações iniciais</SectionTitle><div className="rounded border bg-white p-3 text-sm whitespace-pre-wrap">{op.obs_iniciais}</div></>)}

      {data.materiais.length > 0 && (
        <>
          <SectionTitle accent={meta.cor}>Receita / Materiais</SectionTitle>
          <DataTable rows={data.materiais}
            columns={[
              { header: "Matéria-prima", cell: (r: any) => <><span className="font-mono text-[10px] text-slate-500">{r.codigo}</span> {r.nome}</> },
              { header: "%", align: "right", cell: (r: any) => `${nf(r.percentual, 1)}%` },
              { header: "Prevista", align: "right", cell: (r: any) => `${nf(r.prevista)} ${r.unidade}` },
              { header: "Consumida", align: "right", cell: (r: any) => `${nf(r.consumida)} ${r.unidade}` },
            ]}
          />
        </>
      )}

      {data.etapas.length > 0 && (
        <>
          <SectionTitle accent={meta.cor}>Etapas do processo</SectionTitle>
          <DataTable rows={data.etapas}
            columns={[
              { header: "#", cell: (r: any) => r.ordem_seq },
              { header: "Etapa", cell: (r: any) => r.nome },
              { header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
              { header: "Início", cell: (r: any) => fd(r.inicio_em) },
              { header: "Fim", cell: (r: any) => fd(r.fim_em) },
            ]}
          />
        </>
      )}

      {op.obs_finais && (<><SectionTitle accent={meta.cor}>Observações finais</SectionTitle><div className="rounded border bg-white p-3 text-sm whitespace-pre-wrap">{op.obs_finais}</div></>)}

      <div className="mt-8 grid grid-cols-2 gap-8 break-avoid">
        <div className="border-t-2 border-slate-400 pt-1 text-center text-xs">Operador</div>
        <div className="border-t-2 border-slate-400 pt-1 text-center text-xs">Supervisor</div>
      </div>
    </ReportShell>
  );
}

// ================================================
// 8) ALERTAS 24h
// ================================================
export function Alertas24hReport() {
  const fn = useServerFn(fetchAlertas24h);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["rep-alertas-24h"], queryFn: () => fn() });
  const meta = REPORTS["alertas-24h"];
  if (isLoading || !data) return <ReportShell title={meta.titulo} accent={meta.cor}><div className="p-8 text-center">Carregando…</div></ReportShell>;
  const sevData = Object.entries(data.porSeveridade).map(([label, value]) => ({ label, value }));
  return (
    <ReportShell title={meta.titulo} subtitle={meta.descricao} accent={meta.cor} periodo="Últimas 24h" onRefresh={refetch}>
      <div className="grid grid-cols-4 gap-3 break-avoid">
        <KpiCard label="Total disparos" value={ni(data.kpis.total)} tone="primary" />
        <KpiCard label="Críticos" value={ni(data.kpis.criticos)} tone="danger" />
        <KpiCard label="Abertos" value={ni(data.kpis.abertos)} tone="warning" />
        <KpiCard label="Resolvidos" value={ni(data.kpis.resolvidos)} tone="success" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 break-avoid">
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">Por severidade</div>
          <HBarChart data={sevData} color={meta.cor} max={6} />
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">Top causas (por alerta)</div>
          <HBarChart data={data.topCausas.map((c: any) => ({ label: c.nome, value: c.qtd }))} color={meta.cor} max={6} />
        </div>
      </div>

      <SectionTitle accent={meta.cor}>Disparos detalhados</SectionTitle>
      <DataTable rows={data.disparos}
        columns={[
          { header: "Hora", cell: (r: any) => fd(r.created_at) },
          { header: "Severidade", cell: (r: any) => <SeverityBadge sev={r.severidade} /> },
          { header: "Alerta", cell: (r: any) => <span className="font-semibold">{r.alerta_nome}</span> },
          { header: "Categoria", cell: (r: any) => r.categoria ?? "—" },
          { header: "Mensagem (efeito)", cell: (r: any) => <span className="text-slate-700">{r.mensagem}</span> },
          { header: "Status", cell: (r: any) => <StatusBadge status={r.resolvido_em ? "resolvido" : "aberto"} /> },
        ]}
      />
    </ReportShell>
  );
}

// ================================================
// Router por slug
// ================================================
export function ReportBySlug({ slug, params }: { slug: ReportSlug; params?: Record<string, string> }) {
  switch (slug) {
    case "estoque-total": return <EstoqueTotalReport />;
    case "produtividade-total": return <ProdutividadeTotalReport />;
    case "produtividade-equipamento": return <ProdutividadeEquipReport equipamentoId={params?.equipamento} ordemId={params?.ordem} />;
    case "mensal": return <MensalReport />;
    case "manutencao-24h": return <Manutencao24hReport />;
    case "os-manutencao": return <OsManutencaoReport id={params?.id} />;
    case "ordem-producao": return <OrdemProducaoReport id={params?.id} />;
    case "alertas-24h": return <Alertas24hReport />;
    default: return <div className="p-8">Relatório não encontrado</div>;
  }
}
