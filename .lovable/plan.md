# Gestão de Paradas de Equipamentos — status

## Concluído
- ✅ Migration: coluna nova em `equipamentos` (tag, modo, operador, valor, min, max, tempo_min, alerta_apos_min, motivos)
- ✅ Tabela `paradas_equipamento` com RLS por `owner_id` + delete só admin/gerente
- ✅ Trigger `tags_live_paradas_trigger` detecta parada e retorno à operação (com debounce)
- ✅ Função `dispatch_paradas_alertas` + cron a cada minuto (alerta parada prolongada)
- ✅ Cadastro: nova seção "Gestão de paradas" no formulário de equipamentos
- ✅ CrudTable: suporte a `section` (agrupamento visual) e `chips` (lista editável)
- ✅ Popup global `ParadaMotivoDialog` — abre automaticamente quando há parada aguardando motivo
- ✅ Aba "Paradas" em `/producao/$id` com KPI de disponibilidade, Pareto de motivos, histórico e edição

## Como funciona
1. Cadastro do equipamento define a tag de parada e o modo de detecção
2. Trigger no banco monitora `tags_live` — quando condição é atendida por N segundos, abre parada
3. Quando tag volta ao normal, fecha parada com status `aguardando_motivo`
4. Popup aparece para o operador registrar motivo (não bloqueia trabalho durante parada)
5. Cron dispara alerta se parada exceder o tempo configurado
6. Aba "Paradas" na produção mostra tudo com KPI de disponibilidade

## Segurança
- Aditivo — equipamentos existentes sem `parada_tag_nome` seguem iguais
- Funções internas com EXECUTE revogado (só o próprio banco as chama via trigger/cron)
- RLS multi-tenant preservado

## Próximos passos (se solicitado)
- Widget "Disponibilidade" no dashboard customizável
- Bloco dedicado nos relatórios v2 (impressão A4)
- Notificação por e-mail/push do alerta de parada prolongada (hoje só entra na fila de alertas do sistema)
