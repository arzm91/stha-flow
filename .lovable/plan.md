# Gestão de Paradas de Equipamentos

Adição totalmente aditiva — nenhum equipamento existente é impactado até você configurar a tag de parada. Nada existente será quebrado.

## 1. Cadastro (Equipamentos → nova seção)

Nova seção **"Gestão de paradas"** no formulário de criar/editar equipamento, abaixo de "Unidade da capacidade":

- **Tag de parada** (opcional) — seletor de tag
- **Modo de detecção** (um ou mais podem ser combinados):
  - Valor específico (operador `=`, `<`, `>`, `≤`, `≥`) com valor de referência
  - Fora da faixa normal (min/max de operação)
  - Velocidade abaixo de X por N segundos (anti-oscilação)
- **Tempo mínimo (seg)** para confirmar parada
- **Motivos de parada** — lista editável **por equipamento** (chip/tag list). Padrões pré-preenchidos ao criar: `Falta de energia`, `Parada programada`, `Parada não programada`, `Manutenção`, `Setup/Troca`, `Falta de matéria-prima`, `Outro`.
- **Alertar supervisor após X min** (opcional) — dispara alerta/e-mail/push quando parada excede X minutos.

## 2. Banco de dados

Nova tabela `paradas_equipamento`:
- `equipamento_id`, `owner_id`
- `inicio_em`, `fim_em`, `duracao_seg`
- `tag_nome`, `tag_valor_inicio`, `tag_valor_fim`
- `motivo` (texto), `observacao`, `categoria` (opcional para agrupar)
- `status`: `em_andamento` | `aguardando_motivo` | `registrada`
- `ordem_producao_id` (auto-associa se houver ordem em andamento no equipamento)
- `registrado_por`, `registrado_em`

Novas colunas em `equipamentos`:
- `parada_tag_nome`, `parada_config` (jsonb: modo, operador, valor, min, max, tempo_min_seg, alerta_apos_min), `parada_motivos` (jsonb array)

Trigger em `tags_live` (parecido com `tags_live_automation_trigger`): para cada equipamento com `parada_tag_nome = NEW.nome`, avalia `parada_config`. Se detecta parada e não há registro `em_andamento`, cria um. Se detecta retorno à operação, fecha o registro atual como `aguardando_motivo`.

RLS: SELECT/INSERT/UPDATE por `owner_id` (padrão do projeto). Usuários operadores só veem paradas de equipamentos que têm permissão de recurso.

## 3. Popup de motivo

Novo componente `ParadaMotivoDialog`:
- Aparece no acompanhamento da produção (`/producao/$id` e `/producao`) sempre que houver parada `aguardando_motivo` no equipamento aberto
- **Bloqueia** só quando o equipamento retomar operação — enquanto está parado, só notifica no canto (badge no card do equipamento)
- Assim que a tag detecta retorno à operação, popup modal exige: motivo (dropdown da lista do equipamento) + observação (opcional)
- Também acessível como card "Paradas pendentes" no dashboard de produção para preenchimento posterior

## 4. Indicadores e relatórios

- **KPI de Disponibilidade** = `(tempo_total_periodo − soma_duracao_paradas) / tempo_total_periodo` — novo card em:
  - Dashboard de produção
  - Histórico do equipamento (`/producao/historico/$equipId`)
  - Widget disponível no dashboard customizável
- **Bloco "Paradas" nos relatórios v2** (`src/lib/reports-v2/`):
  - Lista com início, fim, duração, motivo, ordem associada
  - Gráfico Pareto por motivo
  - Total paradas / tempo total parado / % disponibilidade

## 5. Alertas ao supervisor

Reaproveita o sistema de alertas existente (`alertas` + `alertas_disparos`). Novo tipo `alerta_parada_prolongada`: cron/trigger verifica paradas `em_andamento` que ultrapassaram o `alerta_apos_min` configurado no equipamento e cria disparo. Respeita destinatários por equipamento (segurança já implementada).

## Segurança / não quebrar nada

- Todas as mudanças são **aditivas** — colunas com default nulo, tabela nova
- Trigger só age se `parada_tag_nome IS NOT NULL`
- Equipamentos existentes continuam funcionando sem configurar nada
- RLS herda o modelo multitenant já em produção (`owner_id` + permissões de recurso por equipamento)
- Migrations reversíveis; se algo der errado, `DROP` das novas colunas/tabela restaura o estado anterior

## Ordem de implementação

1. Migration: tabela `paradas_equipamento` + colunas em `equipamentos` + trigger de detecção
2. Cadastro: nova seção no formulário de equipamentos
3. Popup e integração no `/producao/$id`
4. KPI de disponibilidade nos dashboards
5. Bloco de paradas nos relatórios
6. Alerta de parada prolongada

## Detalhes técnicos (para referência)

- Trigger `tags_live_paradas_trigger` chama função `evaluate_paradas_equipamento(owner_id, tag_nome, valor_num, valor_num_prev)`
- Debounce via `tempo_min_seg`: parada só é confirmada quando condição persiste; usa `parada_pending_since` em jsonb de estado por equipamento (mesma estratégia do `automation_flow_estab_state`)
- Query de disponibilidade agrega por janela de tempo respeitando ordens em andamento
- Popup usa `supabase.channel` para reagir em tempo real a paradas novas
