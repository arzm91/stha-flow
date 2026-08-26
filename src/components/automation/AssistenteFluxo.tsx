// Assistente guiado para criar uma automação em linguagem simples:
// "QUANDO <gatilho> ... ENTÃO <ação>". Gera o grafo (nós + ligações)
// automaticamente e abre o editor avançado para ajustes finos.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, Zap, Cog } from "lucide-react";
import { COMPARADORES, PRODUCTION_EVENTS } from "@/lib/automation/types";

type Props = { open: boolean; onOpenChange: (o: boolean) => void };

type TriggerKind = "tag_value" | "production_event" | "schedule";
type ActionKind = "criar_ordem" | "iniciar_op" | "finalizar_op" | "criar_aviso" | "enviar_email";

const TRIGGER_OPTIONS: Array<{ value: TriggerKind; label: string; hint: string }> = [
  { value: "tag_value", label: "Uma tag atingir um valor", hint: "Ex.: temperatura maior que 80" },
  { value: "production_event", label: "Acontecer um evento na produção", hint: "Ex.: ordem finalizada" },
  { value: "schedule", label: "Chegar um horário", hint: "Ex.: todo dia às 08:00" },
];

const ACTION_OPTIONS: Array<{ value: ActionKind; label: string }> = [
  { value: "criar_ordem", label: "Criar uma ordem de produção (programada)" },
  { value: "iniciar_op", label: "Iniciar a próxima ordem programada de um equipamento" },
  { value: "finalizar_op", label: "Finalizar a ordem em andamento de um equipamento" },
  { value: "criar_aviso", label: "Criar um aviso no sistema" },
  { value: "enviar_email", label: "Enviar um e-mail" },
];

export function AssistenteFluxo({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState("");
  const [triggerKind, setTriggerKind] = useState<TriggerKind>("tag_value");
  // tag_value
  const [tagNome, setTagNome] = useState("");
  const [operador, setOperador] = useState("gte");
  const [valor, setValor] = useState("");
  // production_event
  const [evento, setEvento] = useState("ordem_status_finalizada");
  // schedule
  const [hora, setHora] = useState("08:00");

  const [actionKind, setActionKind] = useState<ActionKind>("criar_aviso");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [email, setEmail] = useState("");
  const [assunto, setAssunto] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);

  const [tags, setTags] = useState<Array<{ nome: string; nome_amigavel: string | null }>>([]);
  const [equipamentos, setEquipamentos] = useState<Array<{ id: string; codigo: string | null; nome: string }>>([]);
  const [produtos, setProdutos] = useState<Array<{ id: string; codigo: string | null; nome: string }>>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [t, e, p] = await Promise.all([
        supabase.from("tags_live").select("nome, nome_amigavel").order("nome"),
        supabase.from("equipamentos").select("id, codigo, nome").order("codigo"),
        supabase.from("produtos").select("id, codigo, nome").order("nome"),
      ]);
      setTags((t.data as never) ?? []);
      setEquipamentos((e.data as never) ?? []);
      setProdutos((p.data as never) ?? []);
    })();
  }, [open]);

  function buildTriggerConfig(): Record<string, unknown> {
    if (triggerKind === "tag_value") {
      return { type: "tag_value", tag_nome: tagNome.trim(), operador, valor: Number(valor) };
    }
    if (triggerKind === "production_event") {
      return { type: "production_event", evento };
    }
    const [hh, mm] = hora.split(":");
    return { type: "schedule", scheduleMode: "daily", cron: `${Number(mm)} ${Number(hh)} * * *` };
  }

  function buildActionConfig(): Record<string, unknown> {
    switch (actionKind) {
      case "criar_ordem":
        return { type: "criar_ordem", produto_id: produtoId, equipamento_id: equipamentoId, quantidade: Number(quantidade) || 0, prioridade: "media" };
      case "iniciar_op":
        return { type: "iniciar_op", equipamento_id: equipamentoId };
      case "finalizar_op":
        return { type: "finalizar_op", equipamento_id: equipamentoId };
      case "enviar_email":
        return { type: "enviar_email", template: "message", recipient: email.trim(), subject: assunto.trim(), body: mensagem.trim() };
      default:
        return { type: "criar_aviso", titulo: titulo.trim() || "Aviso da automação", mensagem: mensagem.trim(), severidade: "info" };
    }
  }

  function triggerLabel(): string {
    if (triggerKind === "tag_value") {
      const op = COMPARADORES.find((c) => c.value === operador)?.label ?? operador;
      return `Quando ${tagNome || "tag"} ${op} ${valor}`;
    }
    if (triggerKind === "production_event") {
      return `Quando: ${PRODUCTION_EVENTS.find((e) => e.value === evento)?.label ?? evento}`;
    }
    return `Todo dia às ${hora}`;
  }

  function actionLabel(): string {
    const eq = equipamentos.find((e) => e.id === equipamentoId);
    const eqNome = eq ? `${eq.codigo ? `${eq.codigo} · ` : ""}${eq.nome}` : "";
    switch (actionKind) {
      case "criar_ordem": {
        const prod = produtos.find((p) => p.id === produtoId);
        return `Criar OP de ${prod?.nome ?? "produto"} em ${eqNome}`;
      }
      case "iniciar_op": return `Iniciar produção em ${eqNome}`;
      case "finalizar_op": return `Finalizar produção em ${eqNome}`;
      case "enviar_email": return `Enviar e-mail para ${email}`;
      default: return `Criar aviso: ${titulo || "aviso"}`;
    }
  }

  function validate(): string | null {
    if (!nome.trim()) return "Dê um nome para a automação";
    if (triggerKind === "tag_value" && (!tagNome.trim() || valor === "" || Number.isNaN(Number(valor))))
      return "Informe a tag e o valor do gatilho";
    if ((actionKind === "iniciar_op" || actionKind === "finalizar_op" || actionKind === "criar_ordem") && !equipamentoId)
      return "Selecione o equipamento da ação";
    if (actionKind === "criar_ordem" && !produtoId) return "Selecione o produto da ordem";
    if (actionKind === "enviar_email" && !email.trim()) return "Informe o destinatário do e-mail";
    return null;
  }

  async function create() {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");

      const triggerId = crypto.randomUUID();
      const actionId = crypto.randomUUID();
      const triggerConfig = buildTriggerConfig();
      const graph = {
        nodes: [
          {
            id: triggerId,
            type: "trigger",
            position: { x: 60, y: 120 },
            data: { label: triggerLabel(), kind: "trigger", config: triggerConfig },
          },
          {
            id: actionId,
            type: "action",
            position: { x: 420, y: 120 },
            data: { label: actionLabel(), kind: "action", config: buildActionConfig() },
          },
        ],
        edges: [
          { id: crypto.randomUUID(), source: triggerId, target: actionId, animated: true },
        ],
      };

      const { data, error } = await supabase
        .from("automation_flows")
        .insert({
          owner_id: u.user.id,
          nome: nome.trim(),
          ativo: true,
          requires_approval: requiresApproval,
          graph: graph as never,
          trigger_type: triggerConfig.type as never,
          trigger_config: triggerConfig as never,
        } as never)
        .select("id")
        .single();
      if (error) throw error;

      toast.success("Automação criada! Ajuste detalhes no editor se precisar.");
      onOpenChange(false);
      navigate({ to: "/automacoes/$id", params: { id: (data as { id: string }).id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const needsEquip = actionKind === "criar_ordem" || actionKind === "iniciar_op" || actionKind === "finalizar_op";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova automação guiada</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Nome da automação</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Iniciar R7 às 8h" />
          </div>

          {/* QUANDO */}
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" /> QUANDO…
            </p>
            <Select value={triggerKind} onValueChange={(v) => setTriggerKind(v as TriggerKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label} — <span className="text-muted-foreground">{t.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {triggerKind === "tag_value" && (
              <div className="grid grid-cols-[1fr_auto_90px] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Tag</Label>
                  <Input
                    list="assistente-tags"
                    value={tagNome}
                    onChange={(e) => setTagNome(e.target.value)}
                    placeholder="nome_da_tag"
                    className="font-mono text-xs"
                  />
                  <datalist id="assistente-tags">
                    {tags.map((t) => (
                      <option key={t.nome} value={t.nome}>{t.nome_amigavel ?? t.nome}</option>
                    ))}
                  </datalist>
                </div>
                <Select value={operador} onValueChange={setOperador}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPARADORES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                  <Label className="text-xs">Valor</Label>
                  <Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
                </div>
              </div>
            )}

            {triggerKind === "production_event" && (
              <Select value={evento} onValueChange={setEvento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCTION_EVENTS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {triggerKind === "schedule" && (
              <div className="space-y-1">
                <Label className="text-xs">Horário (todo dia, horário de Brasília)</Label>
                <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground" />
          </div>

          {/* ENTÃO */}
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Cog className="h-4 w-4 text-emerald-500" /> ENTÃO…
            </p>
            <Select value={actionKind} onValueChange={(v) => setActionKind(v as ActionKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {needsEquip && (
              <div className="space-y-1">
                <Label className="text-xs">Equipamento</Label>
                <Select value={equipamentoId} onValueChange={setEquipamentoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {equipamentos.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.codigo ? `${e.codigo} · ` : ""}{e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {actionKind === "criar_ordem" && (
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Produto</Label>
                  <Select value={produtoId} onValueChange={setProdutoId}>
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {produtos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.codigo ? `${p.codigo} · ` : ""}{p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantidade</Label>
                  <Input type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
                </div>
              </div>
            )}

            {actionKind === "criar_aviso" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Título do aviso</Label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Verificar reator" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mensagem (opcional)</Label>
                  <Input value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
                </div>
              </>
            )}

            {actionKind === "enviar_email" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Enviar para (e-mail)</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operador@empresa.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Assunto</Label>
                  <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mensagem (opcional)</Label>
                  <Input value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label className="text-sm">Pedir aprovação antes de executar</Label>
              <p className="text-xs text-muted-foreground">
                Se ativo, a automação aparece para aprovação em vez de executar sozinha.
              </p>
            </div>
            <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={create} disabled={saving}>
            {saving ? "Criando…" : "Criar automação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
