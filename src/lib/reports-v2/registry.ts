import type { ReportMeta, ReportSlug } from "./types";

export const REPORTS: Record<ReportSlug, ReportMeta> = {
  "estoque-total": {
    slug: "estoque-total",
    titulo: "Estoque Total",
    descricao: "Saldo atual por produto, movimentações do período e estoque projetado.",
    categoria: "estoque",
    cor: "#059669",
    icone: "Package",
  },
  "produtividade-total": {
    slug: "produtividade-total",
    titulo: "Produtividade — Todos os Equipamentos",
    descricao: "Última produção e total do mês por equipamento, com estoque atual.",
    categoria: "producao",
    cor: "#2563eb",
    icone: "Factory",
  },
  "produtividade-equipamento": {
    slug: "produtividade-equipamento",
    titulo: "Produtividade por Equipamento",
    descricao: "Foco na última produção do equipamento, matérias-primas consumidas e acumulado do mês.",
    categoria: "producao",
    cor: "#1d4ed8",
    icone: "Gauge",
    precisaParam: "equipamento",
  },
  "mensal": {
    slug: "mensal",
    titulo: "Relatório Mensal Consolidado",
    descricao: "Todas as produções do mês com mini-dashboards por equipamento.",
    categoria: "producao",
    cor: "#0ea5e9",
    icone: "CalendarRange",
  },
  "manutencao-24h": {
    slug: "manutencao-24h",
    titulo: "Manutenção — 24h + Programadas",
    descricao: "OSs realizadas nas últimas 24h, programadas e indicadores gerais.",
    categoria: "manutencao",
    cor: "#ea580c",
    icone: "Wrench",
  },
  "os-manutencao": {
    slug: "os-manutencao",
    titulo: "Ordem de Serviço — Manutenção",
    descricao: "Documento completo da OS para impressão ou envio ao técnico.",
    categoria: "manutencao",
    cor: "#c2410c",
    icone: "ClipboardCheck",
    precisaParam: "os-manutencao",
  },
  "ordem-producao": {
    slug: "ordem-producao",
    titulo: "Ordem de Produção",
    descricao: "Ficha completa da OP com receita, materiais e cronograma.",
    categoria: "producao",
    cor: "#4338ca",
    icone: "ScrollText",
    precisaParam: "ordem-producao",
  },
  "alertas-24h": {
    slug: "alertas-24h",
    titulo: "Alertas — Últimas 24h",
    descricao: "Disparos por severidade, causas, efeitos e status de resolução.",
    categoria: "alertas",
    cor: "#dc2626",
    icone: "BellRing",
  },
};

export const REPORT_LIST: ReportMeta[] = Object.values(REPORTS);
