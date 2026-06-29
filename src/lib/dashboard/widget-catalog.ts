export type WidgetTipo = "kpi" | "chart" | "list" | "tag";

export type WidgetSource = {
  key: string;
  tipo: WidgetTipo;
  label: string;
  grupo: string;
  description?: string;
  defaultSize?: { w: number; h: number };
  needsTag?: boolean;
};

export const WIDGET_SOURCES: WidgetSource[] = [
  // ===== Produção =====
  { key: "kpi.producao.em_andamento", tipo: "kpi", grupo: "Produção", label: "Ordens em andamento" },
  { key: "kpi.producao.finalizadas_hoje", tipo: "kpi", grupo: "Produção", label: "Ordens finalizadas (hoje)" },
  { key: "kpi.producao.qtd_hoje", tipo: "kpi", grupo: "Produção", label: "Quantidade produzida (hoje)" },
  { key: "kpi.equipamentos.operando", tipo: "kpi", grupo: "Produção", label: "Equipamentos operando" },
  { key: "kpi.equipamentos.parados", tipo: "kpi", grupo: "Produção", label: "Equipamentos parados" },
  { key: "chart.producao.7dias", tipo: "chart", grupo: "Produção", label: "Produção dos últimos 7 dias", defaultSize: { w: 6, h: 4 } },
  { key: "list.producao.abertas", tipo: "list", grupo: "Produção", label: "Ordens abertas", defaultSize: { w: 4, h: 4 } },

  // ===== Estoque =====
  { key: "kpi.estoque.saldo", tipo: "kpi", grupo: "Estoque", label: "Saldo atual (total)" },
  { key: "kpi.estoque.entradas_hoje", tipo: "kpi", grupo: "Estoque", label: "Entradas (hoje)" },
  { key: "kpi.estoque.saidas_hoje", tipo: "kpi", grupo: "Estoque", label: "Saídas (hoje)" },
  { key: "kpi.estoque.movs_hoje", tipo: "kpi", grupo: "Estoque", label: "Movimentações (hoje)" },
  { key: "chart.estoque.7dias", tipo: "chart", grupo: "Estoque", label: "Movimentações dos últimos 7 dias", defaultSize: { w: 6, h: 4 } },
  { key: "list.estoque.recentes", tipo: "list", grupo: "Estoque", label: "Movimentações recentes", defaultSize: { w: 4, h: 4 } },

  // ===== Alertas =====
  { key: "kpi.alertas.ativos", tipo: "kpi", grupo: "Alertas", label: "Alertas ativos" },
  { key: "kpi.alertas.disparos_24h", tipo: "kpi", grupo: "Alertas", label: "Disparos (24h)" },
  { key: "kpi.alertas.criticos_24h", tipo: "kpi", grupo: "Alertas", label: "Críticos (24h)" },
  { key: "chart.alertas.severidade", tipo: "chart", grupo: "Alertas", label: "Disparos por severidade (7d)", defaultSize: { w: 4, h: 4 } },
  { key: "list.alertas.recentes", tipo: "list", grupo: "Alertas", label: "Alertas recentes", defaultSize: { w: 4, h: 4 } },

  // ===== Manutenção =====
  { key: "kpi.manutencao.pendentes", tipo: "kpi", grupo: "Manutenção", label: "OS pendentes" },
  { key: "kpi.manutencao.atrasadas", tipo: "kpi", grupo: "Manutenção", label: "OS atrasadas" },
  { key: "list.manutencao.proximas", tipo: "list", grupo: "Manutenção", label: "Próximas manutenções", defaultSize: { w: 4, h: 4 } },

  // ===== Turnos =====
  { key: "kpi.turnos.eventos_hoje", tipo: "kpi", grupo: "Turnos", label: "Eventos de turno (hoje)" },

  // ===== Qualidade =====
  { key: "kpi.qualidade.analises_hoje", tipo: "kpi", grupo: "Qualidade", label: "Análises (hoje)" },
  { key: "kpi.qualidade.naoconformes_hoje", tipo: "kpi", grupo: "Qualidade", label: "Não conformes (hoje)" },

  // ===== Tags =====
  { key: "tag.valor", tipo: "tag", grupo: "Tags", label: "Tag ao vivo (valor)", needsTag: true },
  { key: "tag.gauge", tipo: "tag", grupo: "Tags", label: "Tag ao vivo (gauge)", needsTag: true, defaultSize: { w: 3, h: 3 } },
];

export function getSource(key: string): WidgetSource | undefined {
  return WIDGET_SOURCES.find((s) => s.key === key);
}
