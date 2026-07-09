export type ReportSlug =
  | "estoque-total"
  | "produtividade-total"
  | "produtividade-equipamento"
  | "mensal"
  | "manutencao-24h"
  | "os-manutencao"
  | "ordem-producao"
  | "alertas-24h";

export interface ReportMeta {
  slug: ReportSlug;
  titulo: string;
  descricao: string;
  categoria: "estoque" | "producao" | "manutencao" | "alertas";
  cor: string; // hex principal do cabeçalho
  icone: string; // lucide name
  precisaParam?: "equipamento" | "ordem-producao" | "os-manutencao";
}
