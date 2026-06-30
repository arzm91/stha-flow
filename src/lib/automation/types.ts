export type TriggerType = "tag_value" | "tag_stale" | "production_event" | "schedule";

export type ActionType =
  | "movimentacao_estoque"
  | "criar_ordem"
  | "iniciar_op"
  | "finalizar_op"
  | "avancar_ordem"
  | "criar_aviso"
  | "criar_tarefa"
  | "enviar_alerta"
  | "gerar_relatorio"
  | "webhook_http"
  | "aguardar";

export type ConditionType =
  | "equipamento_status"
  | "tag_comparacao"
  | "existe_ordem_programada"
  | "janela_horario";

export type FlowNodeData = {
  label: string;
  kind: "trigger" | "condition" | "action";
  config: Record<string, unknown>;
};

export type FlowGraph = {
  nodes: Array<{
    id: string;
    type: "trigger" | "condition" | "action";
    position: { x: number; y: number };
    data: FlowNodeData;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
};

export const PRODUCTION_EVENTS = [
  { value: "ordem_criada", label: "Ordem criada" },
  { value: "ordem_status_em_andamento", label: "Ordem iniciada" },
  { value: "ordem_status_finalizada", label: "Ordem finalizada" },
  { value: "ordem_status_cancelada", label: "Ordem cancelada" },
];

export const COMPARADORES = [
  { value: "gt", label: "maior que (>)" },
  { value: "lt", label: "menor que (<)" },
  { value: "gte", label: "maior ou igual (≥)" },
  { value: "lte", label: "menor ou igual (≤)" },
  { value: "eq", label: "igual (=)" },
  { value: "neq", label: "diferente (≠)" },
];
