export type WidgetTipo = "kpi" | "chart" | "list" | "tag" | "tank" | "producao" | "xray";

export type WidgetSource = {
  key: string;
  tipo: WidgetTipo;
  label: string;
  grupo: string;
  description?: string;
  /** column span in 12-col grid (responsive). */
  colSpan?: number;
  /** approximate row height multiplier (1 = 1 row ~ 130px). */
  rowSpan?: number;
  /** sort priority — smaller renders first. */
  priority?: number;
  needsTag?: boolean;
  needsTank?: boolean;
  needsEquipamento?: boolean;
  needsSheet?: boolean;
  /** aceita várias tags no mesmo widget */
  needsMultiTag?: boolean;
  defaultSize?: { w: number; h: number };
};


export const WIDGET_SOURCES: WidgetSource[] = [
  // ===== Produção =====
  { key: "kpi.producao.em_andamento", tipo: "kpi", grupo: "Produção", label: "Ordens em andamento", colSpan: 3, rowSpan: 1, priority: 10 },
  { key: "kpi.producao.finalizadas_hoje", tipo: "kpi", grupo: "Produção", label: "Ordens finalizadas (hoje)", colSpan: 3, rowSpan: 1, priority: 10 },
  { key: "kpi.producao.qtd_hoje", tipo: "kpi", grupo: "Produção", label: "Quantidade produzida (hoje)", colSpan: 3, rowSpan: 1, priority: 10 },
  { key: "kpi.equipamentos.operando", tipo: "kpi", grupo: "Produção", label: "Equipamentos operando", colSpan: 3, rowSpan: 1, priority: 10 },
  { key: "kpi.equipamentos.parados", tipo: "kpi", grupo: "Produção", label: "Equipamentos parados", colSpan: 3, rowSpan: 1, priority: 10 },
  { key: "producao.equipamento", tipo: "producao", grupo: "Produção", label: "Prévia de produção (equipamento)", colSpan: 4, rowSpan: 3, priority: 30, needsEquipamento: true },
  { key: "chart.producao.7dias", tipo: "chart", grupo: "Produção", label: "Produção dos últimos 7 dias", colSpan: 6, rowSpan: 3, priority: 40 },
  { key: "list.producao.abertas", tipo: "list", grupo: "Produção", label: "Ordens abertas", colSpan: 4, rowSpan: 3, priority: 60 },

  // ===== Estoque =====
  { key: "kpi.estoque.saldo", tipo: "kpi", grupo: "Estoque", label: "Saldo atual (total)", colSpan: 3, rowSpan: 1, priority: 11 },
  { key: "kpi.estoque.entradas_hoje", tipo: "kpi", grupo: "Estoque", label: "Entradas (hoje)", colSpan: 3, rowSpan: 1, priority: 11 },
  { key: "kpi.estoque.saidas_hoje", tipo: "kpi", grupo: "Estoque", label: "Saídas (hoje)", colSpan: 3, rowSpan: 1, priority: 11 },
  { key: "kpi.estoque.movs_hoje", tipo: "kpi", grupo: "Estoque", label: "Movimentações (hoje)", colSpan: 3, rowSpan: 1, priority: 11 },
  { key: "tank.preview", tipo: "tank", grupo: "Estoque", label: "Tanque / Local de estoque", colSpan: 3, rowSpan: 4, priority: 35, needsTank: true },
  { key: "chart.estoque.7dias", tipo: "chart", grupo: "Estoque", label: "Movimentações dos últimos 7 dias", colSpan: 6, rowSpan: 3, priority: 41 },
  { key: "list.estoque.recentes", tipo: "list", grupo: "Estoque", label: "Movimentações recentes", colSpan: 4, rowSpan: 3, priority: 61 },

  // ===== Alertas =====
  { key: "kpi.alertas.ativos", tipo: "kpi", grupo: "Alertas", label: "Alertas ativos", colSpan: 3, rowSpan: 1, priority: 12 },
  { key: "kpi.alertas.disparos_24h", tipo: "kpi", grupo: "Alertas", label: "Disparos (24h)", colSpan: 3, rowSpan: 1, priority: 12 },
  { key: "kpi.alertas.criticos_24h", tipo: "kpi", grupo: "Alertas", label: "Críticos (24h)", colSpan: 3, rowSpan: 1, priority: 12 },
  { key: "chart.alertas.severidade", tipo: "chart", grupo: "Alertas", label: "Disparos por severidade (7d)", colSpan: 4, rowSpan: 3, priority: 42 },
  { key: "list.alertas.recentes", tipo: "list", grupo: "Alertas", label: "Alertas recentes", colSpan: 4, rowSpan: 3, priority: 62 },

  // ===== Manutenção =====
  { key: "kpi.manutencao.pendentes", tipo: "kpi", grupo: "Manutenção", label: "OS pendentes", colSpan: 3, rowSpan: 1, priority: 13 },
  { key: "kpi.manutencao.atrasadas", tipo: "kpi", grupo: "Manutenção", label: "OS atrasadas", colSpan: 3, rowSpan: 1, priority: 13 },
  { key: "xray.manutencao", tipo: "xray", grupo: "Manutenção", label: "Raio-X de manutenção", colSpan: 6, rowSpan: 3, priority: 50 },
  { key: "list.manutencao.proximas", tipo: "list", grupo: "Manutenção", label: "Próximas manutenções", colSpan: 4, rowSpan: 3, priority: 63 },

  // ===== Turnos =====
  { key: "kpi.turnos.eventos_hoje", tipo: "kpi", grupo: "Turnos", label: "Eventos de turno (hoje)", colSpan: 3, rowSpan: 1, priority: 14 },

  // ===== Qualidade =====
  { key: "kpi.qualidade.analises_hoje", tipo: "kpi", grupo: "Qualidade", label: "Análises (hoje)", colSpan: 3, rowSpan: 1, priority: 15 },
  { key: "kpi.qualidade.naoconformes_hoje", tipo: "kpi", grupo: "Qualidade", label: "Não conformes (hoje)", colSpan: 3, rowSpan: 1, priority: 15 },
  { key: "xray.qualidade", tipo: "xray", grupo: "Qualidade", label: "Raio-X de qualidade", colSpan: 6, rowSpan: 3, priority: 51 },

  // ===== Tabelas =====
  { key: "list.tabela", tipo: "list", grupo: "Tabelas", label: "Tabela personalizada", colSpan: 6, rowSpan: 3, priority: 65, needsSheet: true },

  // ===== Tags =====
  { key: "tag.valor", tipo: "tag", grupo: "Tags", label: "Tag ao vivo (valor)", colSpan: 3, rowSpan: 1, priority: 20, needsTag: true },
  { key: "tag.gauge", tipo: "tag", grupo: "Tags", label: "Tag ao vivo (gauge)", colSpan: 3, rowSpan: 2, priority: 25, needsTag: true },
  { key: "tag.multi", tipo: "tag", grupo: "Tags", label: "Várias tags (lista)", description: "Várias tags empilhadas em lista no mesmo card", colSpan: 4, rowSpan: 3, priority: 22, needsMultiTag: true },
  { key: "tag.tiles", tipo: "tag", grupo: "Tags", label: "Várias tags (grade)", description: "Várias tags exibidas como tiles grandes no mesmo card", colSpan: 6, rowSpan: 2, priority: 21, needsMultiTag: true },
  { key: "tag.stats", tipo: "tag", grupo: "Tags", label: "Tag — estatísticas (atual/mín/máx/média)", colSpan: 4, rowSpan: 2, priority: 24, needsTag: true },
];


export function getSource(key: string): WidgetSource | undefined {
  return WIDGET_SOURCES.find((s) => s.key === key);
}
