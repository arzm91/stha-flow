import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell } from "./ReportShell";
import { KpiCard, SectionTitle, DataTable, StatusBadge } from "./atoms";
import { REPORTS } from "@/lib/reports-v2/registry";
import { formatDate, formatNumber } from "@/lib/format";
import { indiceConversao, sobreposicaoSeg, disponibilidade } from "@/lib/reports-v2/producao-periodo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fd = (d: any) => (d ? formatDate(d) : "—");
const nf = (n: number | null | undefined, d = 2) => (n == null ? "—" : formatNumber(n, d));
function fmtDur(seg: number) {
  seg = Math.max(0, Math.round(seg));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function atalho(tipo: string): [Date, Date] {
  const now = new Date();
  const ini = new Date(now);
  if (tipo === "hoje") ini.setHours(0, 0, 0, 0);
  else if (tipo === "24h") ini.setTime(now.getTime() - 86400000);
  else if (tipo === "semana") { ini.setDate(now.getDate() - ((now.getDay() + 6) % 7)); ini.setHours(0, 0, 0, 0); }
  else if (tipo === "mes") { ini.setDate(1); ini.setHours(0, 0, 0, 0); }
  else if (tipo === "mes_ant") {
    const i = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const f = new Date(now.getFullYear(), now.getMonth(), 1);
    return [i, f];
  }
  return [ini, now];
}

export function ProducaoPeriodoReport() {
  const meta = REPORTS["producao-periodo"];
  const [d0, d1] = atalho("mes");
  const [ini, setIni] = useState(toLocal(d0));
  const [fim, setFim] = useState(toLocal(d1));
  const [equip, setEquip] = useState("all");

  const equipsQ = useQuery({
    queryKey: ["rep-pp-equips"],
    queryFn: async () => (await supabase.from("equipamentos").select("id,nome,codigo").order("nome")).data ?? [],
  });

  const iniISO = new Date(ini).toISOString();
  const fimISO = new Date(fim).toISOString();

  const q = useQuery({
    queryKey: ["rep-pp", iniISO, fimISO, equip],
    queryFn: async () => {
      let oq = supabase.from("ordens_producao")
        .select("id,numero,status,inicio_em,fim_em,qtd_produzida,responsavel_fechamento,equipamento_id,produto:produto_id(nome,unidade,concentracao),equipamento:equipamento_id(nome,codigo)")
        .not("inicio_em", "is", null).lte("inicio_em", fimISO).or(`fim_em.is.null,fim_em.gte.${iniISO}`)
        .order("inicio_em");
      if (equip !== "all") oq = oq.eq("equipamento_id", equip);
      const { data: ordens, error } = await oq;
      if (error) throw error;
      const ids = (ordens ?? []).map((o) => o.id);
      const mats = ids.length
        ? (await supabase.from("ordem_materiais").select("ordem_id,quantidade_consumida,mp:materia_prima_id(nome,unidade)").in("ordem_id", ids)).data ?? []
        : [];
      let pq = supabase.from("paradas_equipamento")
        .select("inicio_em,fim_em,motivo,categoria,observacao,equipamento_id,equipamento:equipamento_id(nome,codigo)")
        .lte("inicio_em", fimISO).or(`fim_em.is.null,fim_em.gte.${iniISO}`).order("inicio_em");
      if (equip !== "all") pq = pq.eq("equipamento_id", equip);
      const paradas = (await pq).data ?? [];
      return { ordens: ordens ?? [], mats, paradas };
    },
  });

  const calc = useMemo(() => {
    if (!q.data) return null;
    const a = new Date(iniISO).getTime(), b = Math.min(new Date(fimISO).getTime(), Date.now());
    const consPorOp = new Map<string, number>();
    const mpMap = new Map<string, { nome: string; unidade: string; qtd: number }>();
    for (const m of q.data.mats as any[]) {
      const v = Number(m.quantidade_consumida ?? 0);
      consPorOp.set(m.ordem_id, (consPorOp.get(m.ordem_id) ?? 0) + v);
      const k = m.mp?.nome ?? "—";
      const cur = mpMap.get(k) ?? { nome: k, unidade: m.mp?.unidade ?? "", qtd: 0 };
      cur.qtd += v; mpMap.set(k, cur);
    }
    const linhas = (q.data.ordens as any[]).map((o) => {
      const prod = Number(o.qtd_produzida ?? 0);
      const cons = consPorOp.get(o.id) ?? 0;
      const dur = ((o.fim_em ? new Date(o.fim_em).getTime() : Date.now()) - new Date(o.inicio_em).getTime()) / 1000;
      return { ...o, prod, cons, dur, indice: indiceConversao(cons, prod) };
    });
    const totalProd = linhas.reduce((s, l) => s + l.prod, 0);
    const totalCons = linhas.reduce((s, l) => s + l.cons, 0);
    const paradas = (q.data.paradas as any[]).map((p) => {
      const pf = p.fim_em ? new Date(p.fim_em).getTime() : Date.now();
      return { ...p, seg: sobreposicaoSeg(a, b, new Date(p.inicio_em).getTime(), pf) };
    });
    const nEquip = equip === "all" ? Math.max(1, (equipsQ.data ?? []).length) : 1;
    const totalSeg = Math.max(0, (b - a) / 1000) * nEquip;
    const paradoSeg = paradas.reduce((s, p) => s + p.seg, 0);
    const prodSeg = linhas.reduce((s, l) => {
      const li = new Date(l.inicio_em).getTime();
      const lf = l.fim_em ? new Date(l.fim_em).getTime() : Date.now();
      return s + sobreposicaoSeg(a, b, li, lf);
    }, 0);
    const mps = [...mpMap.values()].sort((x, y) => y.qtd - x.qtd);
    return {
      linhas, totalProd, totalCons, indice: indiceConversao(totalCons, totalProd),
      paradas, paradoSeg, totalSeg, prodSeg, disp: disponibilidade(totalSeg, paradoSeg), mps,
    };
  }, [q.data, iniISO, fimISO, equip, equipsQ.data]);

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Select onValueChange={(v) => { const [i, f] = atalho(v); setIni(toLocal(i)); setFim(toLocal(f)); }}>
        <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Atalhos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="hoje">Hoje</SelectItem>
          <SelectItem value="24h">Últimas 24h</SelectItem>
          <SelectItem value="semana">Esta semana</SelectItem>
          <SelectItem value="mes">Este mês</SelectItem>
          <SelectItem value="mes_ant">Mês anterior</SelectItem>
        </SelectContent>
      </Select>
      <Input type="datetime-local" className="h-8 w-48" value={ini} onChange={(e) => setIni(e.target.value)} />
      <span className="text-xs text-muted-foreground">até</span>
      <Input type="datetime-local" className="h-8 w-48" value={fim} onChange={(e) => setFim(e.target.value)} />
      <Select value={equip} onValueChange={setEquip}>
        <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os equipamentos</SelectItem>
          {(equipsQ.data ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.codigo ? `${e.codigo} · ` : ""}{e.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const periodo = `${fd(iniISO)} – ${fd(fimISO)}`;
  const equipNome = equip === "all" ? "Todos os equipamentos" : (equipsQ.data ?? []).find((e: any) => e.id === equip)?.nome;

  return (
    <ReportShell title={meta.titulo} subtitle={equipNome} accent={meta.cor} periodo={periodo} onRefresh={() => q.refetch()} actions={actions}>
      {q.isLoading || !calc ? (
        <div className="p-8 text-center text-sm">{q.error ? `Erro: ${(q.error as Error).message}` : "Carregando…"}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 break-avoid">
            <KpiCard label="Total produzido" value={nf(calc.totalProd)} hint={`${calc.linhas.length} produções`} tone="success" />
            <KpiCard label="Total consumido (MP)" value={nf(calc.totalCons)} tone="primary" />
            <KpiCard label="Índice de conversão" value={nf(calc.indice, 3)} hint="consumido ÷ produzido" />
            <KpiCard label="Tempo em produção" value={fmtDur(calc.prodSeg)} />
            <KpiCard label="Paradas" value={`${calc.paradas.length} · ${fmtDur(calc.paradoSeg)}`} tone={calc.paradas.length ? "warning" : "default"} />
            <KpiCard label="OEE · Disponibilidade" value={calc.disp == null ? "—" : `${calc.disp.toFixed(1)}%`}
              tone={calc.disp == null ? "default" : calc.disp >= 85 ? "success" : calc.disp >= 65 ? "warning" : "danger"} />
          </div>

          <SectionTitle accent={meta.cor}>Produções do período</SectionTitle>
          <DataTable rows={calc.linhas} empty="Nenhuma produção no período" columns={[
            { header: "OP", cell: (r: any) => r.numero },
            { header: "Equip.", cell: (r: any) => r.equipamento?.codigo ?? r.equipamento?.nome ?? "—" },
            { header: "Produto", cell: (r: any) => r.produto ? `${r.produto.nome}${r.produto.concentracao != null ? ` · ${r.produto.concentracao}%` : ""}` : "—" },
            { header: "Início", cell: (r: any) => fd(r.inicio_em) },
            { header: "Fim", cell: (r: any) => r.fim_em ? fd(r.fim_em) : <StatusBadge status="em_andamento" /> },
            { header: "Duração", cell: (r: any) => fmtDur(r.dur), align: "right" },
            { header: "Produzido", cell: (r: any) => nf(r.prod), align: "right" },
            { header: "Consumido", cell: (r: any) => nf(r.cons), align: "right" },
            { header: "Índice", cell: (r: any) => <b>{nf(r.indice, 3)}</b>, align: "right" },
          ]} />

          <SectionTitle accent={meta.cor}>Consumo de matérias-primas</SectionTitle>
          <DataTable rows={calc.mps} empty="Sem consumo registrado" columns={[
            { header: "Matéria-prima", cell: (r: any) => r.nome },
            { header: "Quantidade", cell: (r: any) => `${nf(r.qtd)} ${r.unidade}`, align: "right" },
            { header: "Participação", cell: (r: any) => calc.totalCons > 0 ? `${((r.qtd / calc.totalCons) * 100).toFixed(1)}%` : "—", align: "right" },
          ]} />

          <SectionTitle accent={meta.cor}>Paradas e disponibilidade</SectionTitle>
          <div className="mb-3 break-avoid">
            <div className="flex h-4 overflow-hidden rounded bg-slate-200">
              <div className="bg-emerald-500" style={{ width: `${calc.disp ?? 0}%` }} />
              <div className="bg-red-500" style={{ width: `${100 - (calc.disp ?? 100)}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-slate-600">
              <span>Disponível: {fmtDur(calc.totalSeg - calc.paradoSeg)}</span>
              <span>Parado: {fmtDur(calc.paradoSeg)}</span>
            </div>
          </div>
          <DataTable rows={calc.paradas} empty="Nenhuma parada no período" columns={[
            { header: "Equip.", cell: (r: any) => r.equipamento?.codigo ?? r.equipamento?.nome ?? "—" },
            { header: "Início", cell: (r: any) => fd(r.inicio_em) },
            { header: "Fim", cell: (r: any) => r.fim_em ? fd(r.fim_em) : "Em aberto" },
            { header: "Duração", cell: (r: any) => fmtDur(r.seg), align: "right" },
            { header: "Motivo", cell: (r: any) => r.motivo ?? "—" },
            { header: "Categoria", cell: (r: any) => r.categoria ?? "—" },
            { header: "Obs.", cell: (r: any) => r.observacao ?? "" },
          ]} />

          <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[11px] text-slate-600 break-avoid">
            <div className="border-t border-slate-400 pt-1">Responsável pela produção</div>
            <div className="border-t border-slate-400 pt-1">Supervisão</div>
          </div>
        </>
      )}
    </ReportShell>
  );
}
