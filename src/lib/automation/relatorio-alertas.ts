export type DisparoRow = { alerta_nome: string; severidade: string; status: string; created_at: string; resolvido_em: string | null };

const isCrit = (s: string) => s === "critical" || s === "critico";
const isWarn = (s: string) => s === "warning" || s === "atencao";

function fmt(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtDuracao(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, "0")}min`;
}

export function montarRelatorioAlertas(rows: DisparoRow[], inicio: Date, fim: Date, horas: number) {
  const cont = new Map<string, number>();
  for (const r of rows) cont.set(r.alerta_nome, (cont.get(r.alerta_nome) ?? 0) + 1);
  const top = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, qtd]) => ({ nome, qtd }));
  const linhas = rows.slice(0, 50).map((r) => ({
    nome: r.alerta_nome,
    severidade: r.severidade,
    status: r.status,
    inicio: fmt(new Date(r.created_at)),
    duracao: r.resolvido_em ? fmtDuracao(new Date(r.resolvido_em).getTime() - new Date(r.created_at).getTime()) : "ativo",
  }));
  return {
    periodo: `Últimas ${horas}h · ${fmt(inicio)} a ${fmt(fim)}`,
    total: rows.length,
    criticos: rows.filter((r) => isCrit(r.severidade)).length,
    atencao: rows.filter((r) => isWarn(r.severidade)).length,
    ativos: rows.filter((r) => !r.resolvido_em).length,
    top,
    linhas,
    url: "https://sthapc.cloud/relatorios",
  };
}
