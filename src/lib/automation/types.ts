export type TriggerType = "tag_value" | "tag_stale" | "production_event" | "schedule";

export type ActionType =
  | "movimentacao_estoque"
  | "criar_ordem"
  | "avancar_ordem"
  | "enviar_alerta"
  | "webhook_http";

export type TriggerConfig =
  | { type: "tag_value"; tag_nome: string; min?: number; max?: number }
  | { type: "tag_stale"; tag_nome: string; minutos: number }
  | { type: "production_event"; evento: string }
  | { type: "schedule"; cron: string };

export type ActionConfig =
  | {
      type: "movimentacao_estoque";
      tipo: "entrada" | "saida" | "transferencia";
      produto_id?: string;
      tanque_id?: string;
      quantidade: number;
      observacao?: string;
    }
  | { type: "criar_ordem"; produto_id: string; quantidade: number }
  | { type: "avancar_ordem"; ordem_id?: string; proximo_status: string }
  | { type: "enviar_alerta"; titulo: string; mensagem: string; emails: string[] }
  | {
      type: "webhook_http";
      url: string;
      metodo: "GET" | "POST" | "PUT" | "DELETE";
      headers?: Record<string, string>;
      body?: string;
    };

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
  { value: "ordem_status_concluida", label: "Ordem concluída" },
  { value: "ordem_status_cancelada", label: "Ordem cancelada" },
];
