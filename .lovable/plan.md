# Página "Parâmetros da Unidade"

## O que será criado
Uma nova página no menu lateral, **Parâmetros da Unidade**, para a equipe de produção acompanhar os parâmetros operacionais em tempo real.

### Cadastro de parâmetro
Cada parâmetro terá:
- Nome, unidade (°C, bar, kg/h...), grupo/área (ex.: Reator, Caldeira) e equipamento (opcional)
- **Tag de leitura** (valor real, escolhida da lista de tags ao vivo, incluindo tags calculadas)
- **Set (valor ideal)** de dois tipos:
  - Manual: número digitado
  - Calculado: fórmula com tags e constantes, ex. `TagX * TagY / K` — escolhendo tags por seleção (sem digitar códigos), com constantes nomeadas (K1, K2...) e botões de operadores, igual às tags calculadas
- **Margens mín. e máx.**: valor fixo ou percentual em torno do set (ex. ±5%), também recalculadas quando o set muda
- Faixa "ideal" (tolerância) opcional, para diferenciar "ideal" de "dentro da margem"

### Tela de acompanhamento (simples e objetiva)
- Cartões/linhas agrupados por área, atualizando sozinhos (a cada poucos segundos)
- Para cada parâmetro: valor atual, set atual, mín/máx, desvio (valor e %), status com cor e ícone:
  - Abaixo (azul/alerta), Ideal (verde), Acima (vermelho/alerta)
- Barra visual mostrando onde o valor está entre mín, set e máx
- Minigráfico de tendência e indicação "subindo/descendo"
- Indicação de leitura atrasada ou tag sem dado (não confundir com zero)
- Filtros: área, equipamento, "só fora da margem"
- Resumo no topo: total, ideais, acima, abaixo

### Impressão A4
- Botão **Imprimir relatório**: layout próprio para folha A4 (retrato), com cabeçalho (empresa, data/hora, usuário, turno), tabela de todos os parâmetros e campo de assinatura/observações
- Parâmetros fora da margem **reforçados**: negrito, fundo destacado, ícone e listados também em um quadro "Atenção" no início do relatório
- Sem menus/botões na impressão; quebra de página sem cortar linhas

### Segurança
- Dados separados por empresa (mesma regra multiempresa do resto do sistema)
- Edição liberada a todos os usuários, conforme as permissões abertas atuais

## Detalhes técnicos
- Nova tabela `parametros_unidade` (owner_id, nome, unidade, grupo, equipamento_id, tag_leitura, set_modo manual|formula, set_valor, set_formula, constantes jsonb, margem_modo abs|pct, min/max, tolerancia_ideal, ordem, ativo) com GRANT + RLS por `effective_owner`.
- Cálculo do set e status no navegador, reutilizando `expr-eval` e o resolvedor de tags já usado pelas tags calculadas; leitura de `tags_live` com refetch periódico; tendência via `producao_tag_historico`.
- Rota `src/routes/_authenticated/parametros-unidade.tsx` + componentes de formulário de fórmula e card; item no `AppSidebar`.
- Impressão via CSS `@media print` + `@page { size: A4 }`.
- Teste unitário das regras de status (abaixo/ideal/acima) e do cálculo do set por fórmula.

## Estimativa de créditos
Não consigo ver o saldo exato de custo antes de executar, mas por experiência com tarefas desse porte (1 tabela nova, 1 página, formulário com fórmulas, layout de impressão e testes): **aproximadamente 3 a 6 créditos** em uma execução. Ajustes posteriores de visual costumam custar cerca de 0,5 a 1 crédito cada.
