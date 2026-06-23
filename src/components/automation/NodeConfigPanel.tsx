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
import { PRODUCTION_EVENTS } from "@/lib/automation/types";

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
    <div className="flex h-full w-80 flex-col border-l bg-card">
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
                  <SelectItem value="tag_value">Tag atinge valor (min/máx)</SelectItem>
                  <SelectItem value="tag_stale">Tag sem atualização</SelectItem>
                  <SelectItem value="production_event">Evento de produção</SelectItem>
                  <SelectItem value="schedule">Agendamento (cron)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cfg.type === "tag_value" && (
              <>
                <div className="space-y-1">
                  <Label>Nome da tag</Label>
                  <Input value={String(cfg.tag_nome ?? "")} onChange={(e) => set({ tag_nome: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Mínimo</Label>
                    <Input type="number" value={String(cfg.min ?? "")} onChange={(e) => set({ min: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                  <div>
                    <Label>Máximo</Label>
                    <Input type="number" value={String(cfg.max ?? "")} onChange={(e) => set({ max: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                </div>
              </>
            )}

            {cfg.type === "tag_stale" && (
              <>
                <div className="space-y-1">
                  <Label>Nome da tag</Label>
                  <Input value={String(cfg.tag_nome ?? "")} onChange={(e) => set({ tag_nome: e.target.value })} />
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

            {cfg.type === "schedule" && (
              <div className="space-y-1">
                <Label>Cron</Label>
                <Input value={String(cfg.cron ?? "0 * * * *")} onChange={(e) => set({ cron: e.target.value })} />
                <p className="text-xs text-muted-foreground">Ex: <code>0 * * * *</code> (a cada hora)</p>
              </div>
            )}
          </>
        )}

        {node.type === "action" && (
          <>
            <div className="space-y-1">
              <Label>Tipo de ação</Label>
              <Select value={String(cfg.type ?? "")} onValueChange={(v) => set({ type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="movimentacao_estoque">Movimentação de estoque</SelectItem>
                  <SelectItem value="criar_ordem">Criar ordem de produção</SelectItem>
                  <SelectItem value="avancar_ordem">Avançar status de ordem</SelectItem>
                  <SelectItem value="enviar_alerta">Enviar alerta</SelectItem>
                  <SelectItem value="webhook_http">Chamar webhook HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                  <Label>Produto ID</Label>
                  <Input value={String(cfg.produto_id ?? "")} onChange={(e) => set({ produto_id: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Tanque ID (opcional)</Label>
                  <Input value={String(cfg.tanque_id ?? "")} onChange={(e) => set({ tanque_id: e.target.value })} />
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

            {cfg.type === "criar_ordem" && (
              <>
                <div className="space-y-1">
                  <Label>Produto ID</Label>
                  <Input value={String(cfg.produto_id ?? "")} onChange={(e) => set({ produto_id: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Quantidade</Label>
                  <Input type="number" value={String(cfg.quantidade ?? 0)} onChange={(e) => set({ quantidade: Number(e.target.value) })} />
                </div>
              </>
            )}

            {cfg.type === "avancar_ordem" && (
              <>
                <div className="space-y-1">
                  <Label>ID da ordem (ou usar do gatilho)</Label>
                  <Input value={String(cfg.ordem_id ?? "")} onChange={(e) => set({ ordem_id: e.target.value })} placeholder="Deixe em branco para usar a do gatilho" />
                </div>
                <div className="space-y-1">
                  <Label>Próximo status</Label>
                  <Input value={String(cfg.proximo_status ?? "")} onChange={(e) => set({ proximo_status: e.target.value })} />
                </div>
              </>
            )}

            {cfg.type === "enviar_alerta" && (
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
                  <Label>Emails (separados por vírgula)</Label>
                  <Input
                    value={Array.isArray(cfg.emails) ? (cfg.emails as string[]).join(",") : ""}
                    onChange={(e) => set({ emails: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  />
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
          </>
        )}

        {node.type === "condition" && (
          <p className="text-xs text-muted-foreground">
            Condições são avaliadas no momento da aprovação. Em breve.
          </p>
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
