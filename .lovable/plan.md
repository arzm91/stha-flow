## Objetivo

Adicionar dentro de **Produção** uma nova página **PCP / Ordens** que centraliza programação e acompanhamento das ordens de produção, com quatro visualizações da mesma lista e fluxo de iniciar/enfileirar ordens por equipamento.

## Mudanças no banco

Adicionar à tabela `ordens_producao` (sem quebrar o fluxo atual):

- `inicio_previsto timestamptz` — data/hora programada
- `duracao_estimada_min integer` — duração prevista (calculada a partir dos processos do produto ao criar, editável)
- `prioridade text` default `'media'` (`alta` | `media` | `baixa`)
- novo valor de status: `programada` (além de `em_andamento`, `finalizada`, `cancelada`)
- `fila_posicao integer` — ordem dentro da fila do equipamento (para enfileiramento)

Nada é obrigatório: ordens antigas continuam funcionando. Índice em `(equipamento_id, status, fila_posicao)`.

## Nova rota

`src/routes/_authenticated/producao.pcp.tsx` (link adicionado no header de `/producao` ao lado de "Dashboard").

Quatro abas (Tabs do shadcn) sobre a mesma query:

1. **Kanban** — 3 colunas: Programadas · Em andamento · Finalizadas (últimas 30). Card mostra OP, produto, equipamento, prioridade, horário previsto/início, duração.
2. **Fila por equipamento** — uma linha por equipamento ativo; chips em sequência (programadas na ordem de `fila_posicao`, depois a em andamento destacada). Botões ↑ ↓ para reordenar a fila.
3. **Calendário** — mensal/semanal (toggle), ordens posicionadas por `inicio_previsto`, coloridas por equipamento. Clique no dia abre lista; clique na ordem abre painel lateral.
4. **Gantt** — timeline horizontal, eixo Y = equipamentos, eixo X = tempo (zoom dia/semana). Barras com largura = `duracao_estimada_min`. Em andamento usa início real; programadas usam `inicio_previsto`.

## Programação de nova ordem

Diálogo "Programar ordem" (reaproveita `NovaOPDialog` com modo `programar`):

- Campos obrigatórios: produto, equipamento, quantidade, **data/hora prevista**, **duração estimada**, **prioridade**.
- Duração é pré-preenchida somando `tempo_estimado_minutos` dos processos do produto, e editável.
- Salva com `status = 'programada'` e `fila_posicao` = próximo na fila do equipamento.

## Ação "Iniciar produção"

Ao clicar numa ordem programada:

- Se o equipamento está **disponível** → confirma, atualiza `status = 'em_andamento'`, grava `inicio_em` com `server_now()`, marca equipamento como `ocupado`, reordena a fila, navega para `/producao/$id`.
- Se está **ocupado** → mostra que a ordem ficará **enfileirada** (posição N) e fica disponível um botão "Iniciar assim que liberar". Quando a OP atual é finalizada (no `finalizar` já existente em `producao.$id.tsx`), promovemos automaticamente a próxima da fila para `em_andamento` se ela tiver a flag `auto_iniciar`.

## Detalhes técnicos

- Reusa `supabase.rpc('server_now')` já existente para timestamps.
- Query única `["pcp-ordens"]` com refetch 15s, alimentando as 4 visualizações via `useMemo`.
- Kanban e Fila: drag opcional (fase 2); v1 usa botões ↑ ↓ e select de status.
- Calendário: componente leve próprio em grid CSS (sem dependência nova) para evitar peso de react-big-calendar.
- Gantt: SVG simples calculado a partir de min/max das datas visíveis; zoom controla escala px/minuto.
- Painel lateral (`Sheet`) com detalhes da ordem + ações: Iniciar, Reprogramar, Cancelar, Abrir.
- Permissões: respeita `usePagePermissions('producao', { needEdit })` para ações de escrita.

## Arquivos

- **Migração**: adiciona colunas, valor de status `programada`, índice.
- **Nova rota**: `src/routes/_authenticated/producao.pcp.tsx` (página com Tabs).
- **Novos componentes** em `src/components/producao/pcp/`: `KanbanView.tsx`, `FilaEquipamentosView.tsx`, `CalendarioView.tsx`, `GanttView.tsx`, `ProgramarOrdemDialog.tsx`, `OrdemDetalheSheet.tsx`.
- **Editado**: `producao.index.tsx` (link "PCP / Ordens"), `producao.$id.tsx` (ao finalizar, promover próxima da fila).

## Fora do escopo desta entrega

- Drag-and-drop entre colunas/datas (botões e diálogo de reprogramar cobrem o caso).
- Sugerir equipamento alternativo automaticamente.
- Notificações push quando o equipamento libera.