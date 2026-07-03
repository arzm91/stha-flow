import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { PRODUCTION_EVENTS, COMPARADORES } from "@/lib/automation/types";
import { TagPicker, EquipamentoPicker, ProdutoPicker } from "./TagPicker";

type Node = {
  id: string;
  type: "trigger" | "condition" | "action";
  data: { label: string; kind: string; config: Record<string, unknown> };
};

export function NodeConfigPanel({
  node,
  onChange,
  onClose,
  onDelete,
}: {
  node: Node;
  onChange: (next: Node) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const cfg = node.data.config;
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...node, data: { ...node.data, config: { ...cfg, ...patch } } });
  const setLabel = (label: string) => onChange({ ...node, data: { ...node.data, label } });

  return (
    <div className="flex h-full w-96 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <div className="text-sm font-semibold capitalize">{node.type}</div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1">
          <Label>Nome do nó</Label>
          <Input value={node.data.label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        {node.type === "trigger" && (
          <>
            <div className="space-y-1">
              <Label>Tipo de gatilho</Label>
              <Select value={String(cfg.type ?? "")} onValueChange={(v) => set({ type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tag_value">Tag comparada a um valor</SelectItem>
                  <SelectItem value="tag_stale">Tag sem atualização</SelectItem>
                  <SelectItem value="tag_stabilization">Detecção/estabilização de tag</SelectItem>
                  <SelectItem value="production_event">Evento de produção</SelectItem>
                  <SelectItem value="schedule">Agendamento (cron)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cfg.type === "tag_value" && (
              <>
                <div className="space-y-1">
                  <Label>Tag (da lista de endpoints)</Label>
                  <TagPicker value={String(cfg.tag_nome ?? "")} onChange={(v) => set({ tag_nome: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Operador</Label>
                    <Select value={String(cfg.operador ?? "gt")} onValueChange={(v) => set({ operador: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COMPARADORES.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  {cfg.operador === "between" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Mínimo</Label>
                        <Input type="number" value={String(cfg.valor_min ?? "")} onChange={(e) => set({ valor_min: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Máximo</Label>
                        <Input type="number" value={String(cfg.valor_max ?? "")} onChange={(e) => set({ valor_max: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label>Valor</Label>
                      <Input type="number" value={String(cfg.valor ?? "")} onChange={(e) => set({ valor: e.target.value === "" ? undefined : Number(e.target.value) })} />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Dispara quando o valor da tag satisfizer a comparação selecionada.
                </p>
              </>
            )}

            {cfg.type === "tag_stale" && (
              <>
                <div className="space-y-1">
                  <Label>Tag</Label>
                  <TagPicker value={String(cfg.tag_nome ?? "")} onChange={(v) => set({ tag_nome: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Minutos sem atualização</Label>
                  <Input type="number" value={String(cfg.minutos ?? 5)} onChange={(e) => set({ minutos: Number(e.target.value) })} />
                </div>
              </>
            )}

            {cfg.type === "production_event" && (
              <div className="space-y-1">
                <Label>Evento</Label>
                <Select value={String(cfg.evento ?? "")} onValueChange={(v) => set({ evento: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {PRODUCTION_EVENTS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {cfg.type === "tag_stabilization" && (
              <>
                <div className="space-y-1">
                  <Label>Tag a monitorar</Label>
                  <TagPicker value={String(cfg.tag_nome ?? "")} onChange={(v) => set({ tag_nome: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Disparar quando</Label>
                  <Select
                    value={String(cfg.evento ?? "estabilizou")}
                    onValueChange={(v) => set({ evento: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inicio_consumo">Início de variação detectado</SelectItem>
                      <SelectItem value="estabilizou">Variação estabilizou novamente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label>Variação (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={String(cfg.pct ?? 2)}
                      onChange={(e) => set({ pct: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Janela (s)</Label>
                    <Input
                      type="number"
                      value={String(cfg.janela_seg ?? 30)}
                      onChange={(e) => set({ janela_seg: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Estável por (s)</Label>
                    <Input
                      type="number"
                      value={String(cfg.min_estavel_seg ?? 30)}
                      onChange={(e) => set({ min_estavel_seg: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Compara máx/mín da tag na janela. Se ultrapassar o %, marca início; se ficar abaixo do % pelo tempo mínimo, considera estabilizado.
                </p>
              </>
            )}

            {cfg.type === "schedule" && (
              <div className="space-y-1">
                <Label>Cron</Label>
                <Input value={String(cfg.cron ?? "0 * * * *")} onChange={(e) => set({ cron: e.target.value })} />
                <p className="text-xs text-muted-foreground">Ex: <code>0 * * * *</code> (a cada hora)</p>
              </div>
            )}
          </>
        )}

        {node.type === "condition" && (
          <>
            <div className="space-y-1">
              <Label>Tipo de condição</Label>
              <Select value={String(cfg.type ?? "")} onValueChange={(v) => set({ type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equipamento_status">Equipamento está em status…</SelectItem>
                  <SelectItem value="tag_comparacao">Comparar outra tag</SelectItem>
                  <SelectItem value="existe_ordem_programada">Existe OP programada para equipamento</SelectItem>
                  <SelectItem value="janela_horario">Dentro de janela de horário</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cfg.type === "equipamento_status" && (
              <>
                <div className="space-y-1">
                  <Label>Equipamento</Label>
                  <EquipamentoPicker value={String(cfg.equipamento_id ?? "")} onChange={(v) => set({ equipamento_id: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Status esperado</Label>
                  <Select value={String(cfg.status ?? "ocupado")} onValueChange={(v) => set({ status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disponivel">Disponível (livre)</SelectItem>
                      <SelectItem value="ocupado">Ocupado (operando)</SelectItem>
                      <SelectItem value="parado">Parado</SelectItem>
                      <SelectItem value="manutencao">Em manutenção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {cfg.type === "tag_comparacao" && (
              <>
                <div className="space-y-1">
                  <Label>Tag</Label>
                  <TagPicker value={String(cfg.tag_nome ?? "")} onChange={(v) => set({ tag_nome: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Operador</Label>
                    <Select value={String(cfg.operador ?? "gt")} onValueChange={(v) => set({ operador: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COMPARADORES.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  {cfg.operador === "between" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Mínimo</Label>
                        <Input type="number" value={String(cfg.valor_min ?? "")} onChange={(e) => set({ valor_min: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Máximo</Label>
                        <Input type="number" value={String(cfg.valor_max ?? "")} onChange={(e) => set({ valor_max: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label>Valor</Label>
                      <Input type="number" value={String(cfg.valor ?? 0)} onChange={(e) => set({ valor: Number(e.target.value) })} />
                    </div>
                  )}
                </div>
              </>
            )}

            {cfg.type === "existe_ordem_programada" && (
              <div className="space-y-1">
                <Label>Equipamento</Label>
                <EquipamentoPicker value={String(cfg.equipamento_id ?? "")} onChange={(v) => set({ equipamento_id: v })} />
              </div>
            )}

            {cfg.type === "janela_horario" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Início (HH:MM)</Label>
                  <Input value={String(cfg.inicio ?? "08:00")} onChange={(e) => set({ inicio: e.target.value })} />
                </div>
                <div>
                  <Label>Fim (HH:MM)</Label>
                  <Input value={String(cfg.fim ?? "18:00")} onChange={(e) => set({ fim: e.target.value })} />
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Se a condição for falsa, as ações conectadas em seguida são puladas.
            </p>
          </>
        )}

        {node.type === "action" && (
          <>
            <div className="space-y-1">
              <Label>Tipo de ação</Label>
              <Select value={String(cfg.type ?? "")} onValueChange={(v) => set({ type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="iniciar_op">▶ Iniciar próxima OP do equipamento</SelectItem>
                  <SelectItem value="finalizar_op">■ Finalizar OP em andamento</SelectItem>
                  <SelectItem value="criar_ordem">＋ Criar nova OP (programada)</SelectItem>
                  <SelectItem value="avancar_ordem">Avançar status de ordem</SelectItem>
                  <SelectItem value="criar_aviso">🔔 Criar aviso (popup)</SelectItem>
                  <SelectItem value="criar_tarefa">☑ Criar tarefa (popup)</SelectItem>
                  <SelectItem value="enviar_alerta">⚠ Disparar alerta</SelectItem>
                  <SelectItem value="gerar_relatorio">📄 Gerar relatório</SelectItem>
                  <SelectItem value="movimentacao_estoque">📦 Movimentação de estoque</SelectItem>
                  <SelectItem value="webhook_http">🌐 Chamar webhook HTTP</SelectItem>
                  <SelectItem value="aguardar">⏱ Aguardar (segundos)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cfg.type === "iniciar_op" && (
              <div className="space-y-1">
                <Label>Equipamento</Label>
                <EquipamentoPicker value={String(cfg.equipamento_id ?? "")} onChange={(v) => set({ equipamento_id: v })} />
                <p className="text-[11px] text-muted-foreground">
                  Pega a próxima OP programada na fila do equipamento e inicia (usa horário do servidor).
                </p>
              </div>
            )}

            {cfg.type === "finalizar_op" && (
              <>
                <div className="space-y-1">
                  <Label>Equipamento</Label>
                  <EquipamentoPicker value={String(cfg.equipamento_id ?? "")} onChange={(v) => set({ equipamento_id: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Tag com a quantidade produzida (opcional)</Label>
                  <TagPicker value={String(cfg.qtd_produzida_tag ?? "")} onChange={(v) => set({ qtd_produzida_tag: v })} />
                  <p className="text-[11px] text-muted-foreground">
                    Se a tag existir e tiver valor, será usada como <b>quantidade produzida</b>. Caso contrário, mantém a <b>quantidade planejada</b>.
                  </p>
                </div>
              </>
            )}

            {cfg.type === "criar_ordem" && (
              <>
                <div className="space-y-1">
                  <Label>Produto</Label>
                  <ProdutoPicker value={String(cfg.produto_id ?? "")} onChange={(v) => set({ produto_id: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Equipamento</Label>
                  <EquipamentoPicker value={String(cfg.equipamento_id ?? "")} onChange={(v) => set({ equipamento_id: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Quantidade</Label>
                    <Input type="number" value={String(cfg.quantidade ?? 0)} onChange={(e) => set({ quantidade: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select value={String(cfg.prioridade ?? "media")} onValueChange={(v) => set({ prioridade: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="baixa">Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={cfg.auto_iniciar === true}
                    onChange={(e) => set({ auto_iniciar: e.target.checked })}
                  />
                  Iniciar automaticamente quando o equipamento liberar
                </label>
              </>
            )}

            {cfg.type === "avancar_ordem" && (
              <>
                <div className="space-y-1">
                  <Label>ID da ordem (deixe vazio para usar a do gatilho)</Label>
                  <Input value={String(cfg.ordem_id ?? "")} onChange={(e) => set({ ordem_id: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Próximo status</Label>
                  <Select value={String(cfg.proximo_status ?? "em_andamento")} onValueChange={(v) => set({ proximo_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="programada">Programada</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="finalizada">Finalizada</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {(cfg.type === "criar_aviso" || cfg.type === "criar_tarefa" || cfg.type === "enviar_alerta") && (
              <>
                <div className="space-y-1">
                  <Label>Título</Label>
                  <Input value={String(cfg.titulo ?? "")} onChange={(e) => set({ titulo: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Mensagem</Label>
                  <Textarea value={String(cfg.mensagem ?? "")} onChange={(e) => set({ mensagem: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Severidade</Label>
                  <Select value={String(cfg.severidade ?? "info")} onValueChange={(v) => set({ severidade: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warn">Atenção</SelectItem>
                      <SelectItem value="critical">Crítico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Aparece no popup flutuante na aba {cfg.type === "criar_tarefa" ? "Tarefas" : cfg.type === "criar_aviso" ? "Avisos" : "Alertas"}.
                </p>
              </>
            )}

            {cfg.type === "gerar_relatorio" && (
              <>
                <div className="space-y-1">
                  <Label>Tipo de relatório</Label>
                  <Select value={String(cfg.tipo ?? "producao")} onValueChange={(v) => set({ tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="producao">Produção</SelectItem>
                      <SelectItem value="qualidade">Qualidade</SelectItem>
                      <SelectItem value="estoque">Estoque</SelectItem>
                      <SelectItem value="turno">Turno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Título</Label>
                  <Input value={String(cfg.titulo ?? "Relatório automático")} onChange={(e) => set({ titulo: e.target.value })} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Registra uma solicitação na aba Avisos. Envio por e-mail será adicionado quando o conector de e-mail estiver configurado.
                </p>
              </>
            )}

            {cfg.type === "movimentacao_estoque" && (
              <>
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={String(cfg.tipo ?? "entrada")} onValueChange={(v) => set({ tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="saida">Saída</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Produto</Label>
                  <ProdutoPicker value={String(cfg.produto_id ?? "")} onChange={(v) => set({ produto_id: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Quantidade</Label>
                  <Input type="number" value={String(cfg.quantidade ?? 0)} onChange={(e) => set({ quantidade: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>Observação</Label>
                  <Textarea value={String(cfg.observacao ?? "")} onChange={(e) => set({ observacao: e.target.value })} />
                </div>
              </>
            )}

            {cfg.type === "webhook_http" && (
              <>
                <div className="space-y-1">
                  <Label>URL</Label>
                  <Input value={String(cfg.url ?? "")} onChange={(e) => set({ url: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Método</Label>
                  <Select value={String(cfg.metodo ?? "POST")} onValueChange={(v) => set({ metodo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["GET", "POST", "PUT", "DELETE"].map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Body (JSON, opcional)</Label>
                  <Textarea value={String(cfg.body ?? "")} onChange={(e) => set({ body: e.target.value })} />
                </div>
              </>
            )}

            {cfg.type === "aguardar" && (
              <div className="space-y-1">
                <Label>Segundos (máx 60)</Label>
                <Input type="number" min={0} max={60} value={String(cfg.segundos ?? 5)} onChange={(e) => set({ segundos: Number(e.target.value) })} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t p-4">
        <Button variant="destructive" className="w-full" onClick={onDelete}>
          <X className="mr-2 size-4" /> Excluir nó
        </Button>
      </div>
    </div>
  );
}
