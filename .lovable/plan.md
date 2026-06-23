## Visão geral

Vou criar um **motor de automação** com editor visual em canvas (estilo n8n) onde você desenha fluxos conectando gatilhos → condições → ações. Toda execução fica como **tarefa pendente** num popup flutuante no canto inferior direito, aguardando aprovação humana antes de movimentar estoque, criar ordem, chamar webhook ou disparar email.

## O que vai ser construído

### 1. Página `/automacoes` (canvas drag-and-drop)
- Lista de fluxos salvos (ativo/inativo, últimas execuções).
- Editor visual usando **React Flow** (`@xyflow/react`) — nós conectáveis por linhas, painel lateral para configurar cada nó.
- Tipos de nó:
  - **Gatilho** (1 por fluxo): tag atinge valor, tag stale, evento de produção, agendamento cron.
  - **Condição** (opcional, várias): comparações `E`/`OU` sobre valores de tags ou contexto.
  - **Ação** (uma ou mais): movimentação estoque/tanque, criar/avançar ordem, enviar alerta, chamar webhook HTTP.
- Botão "Testar" simula execução sem efetivar ações.

### 2. Popup flutuante de aprovação (global)
- Componente fixo no canto inferior direito, presente em todas as páginas autenticadas.
- Badge com contador de pendências; ao clicar abre card com: nome do fluxo, gatilho disparado, ações propostas (com parâmetros calculados), botões **Aprovar / Rejeitar / Adiar**.
- Realtime via Supabase channels — surge automaticamente quando uma execução pendente é criada.

### 3. Motor de execução (backend)
- Tabela de fluxos + tabela de execuções pendentes.
- **Avaliação dos gatilhos**:
  - *Tag atinge valor* e *tag stale*: trigger no banco em `tags_live` checa fluxos ativos relevantes.
  - *Evento de produção*: triggers em `ordens_producao` / `ordem_etapas`.
  - *Agendamento*: pg_cron chamando rota pública a cada minuto.
- Quando dispara, cria linha em `automation_runs` com status `pending_approval` e snapshot dos parâmetros da ação → popup acende.
- Ao aprovar, server function `executeAutomationRun` roda as ações em sequência (com idempotência) e marca como `completed`/`failed`.

### 4. Email de notificação (opcional por fluxo)
- Uso do **Lovable Emails** nativo (precisa configurar um subdomínio depois, mas a infra já fica pronta).
- Template "Aprovação pendente" enviado para o dono do fluxo quando há nova pendência.

## Estrutura técnica

```text
src/routes/_authenticated/
  automacoes.index.tsx        # lista de fluxos
  automacoes.$id.tsx          # editor canvas (React Flow)

src/components/automation/
  FlowCanvas.tsx              # wrapper React Flow
  nodes/{TriggerNode,ConditionNode,ActionNode}.tsx
  NodeConfigPanel.tsx         # painel lateral de config
  PendingApprovalsDock.tsx    # popup flutuante global (renderizado no _authenticated/route)

src/lib/automation/
  types.ts                    # schemas Zod dos nós
  evaluator.functions.ts      # createServerFn: dispatchTrigger, executeRun, approveRun, rejectRun
  actions/{movimentacao,ordem,webhook,email}.ts

supabase migrations:
  automation_flows(id, owner_id, nome, ativo, graph jsonb, created_at, updated_at)
  automation_runs(id, flow_id, owner_id, status, trigger_context jsonb, planned_actions jsonb, result jsonb, created_at, approved_at, approved_by)
  triggers em tags_live / ordens_producao chamando função public.enqueue_automation_runs
  pg_cron 1x/min para fluxos com gatilho de agendamento
```

Todas as tabelas com RLS escopado por `owner_id = auth.uid()`, GRANT para `authenticated`/`service_role`.

## Limites desta entrega

- Email usa Lovable Emails — vou deixar a infra pronta mas a verificação do domínio é um passo seu (te aviso quando chegar lá).
- Nesta primeira versão **não** terei: loops, branches paralelas, retry com backoff configurável, versionamento de fluxo, ou marketplace de templates. Dá pra adicionar depois.
- Página de **Alertas** (que você mencionou antes) vou construir num passo seguinte, reaproveitando esse motor — alerta vira só uma ação "enviar alerta" dentro de um fluxo.

## Próximo passo

Se aprovar, eu sigo nesta ordem: (1) migration do schema e triggers, (2) editor canvas + CRUD de fluxos, (3) motor de execução + dock de aprovação, (4) ações concretas (estoque, ordem, webhook), (5) email + cron de agendamento.