# Dashboard para TV, criado por pedido em texto

O dashboard continua individual: cada usuário cria e vê só os seus painéis, sempre com os dados da própria empresa.

## 1. Criar o painel escrevendo um pedido
- Botão **"Criar com assistente"**: você escreve, por exemplo, *"painel do reator: temperatura, pressão, produção de hoje, paradas e alertas"*.
- O assistente monta os cards usando só os dados que existem no sistema: tags (inclusive as calculadas), produção, paradas, estoque/tanques, alertas, parâmetros da unidade e turnos.
- Antes de salvar, você vê uma **prévia** e pode aceitar, pedir ajustes ("aumenta a temperatura", "tira o estoque") ou descartar. Nada do dashboard atual é apagado sem a sua confirmação.

## 2. Vários painéis por usuário
- Cada usuário pode ter painéis com nome (ex.: "Reator", "Expedição", "Turno").
- Os painéis existentes viram o painel "Principal", sem perder nada.

## 3. Modo TV
- Botão **"Modo TV"**: tela cheia, sem menu e sem botões, fonte grande e alto contraste (fundo escuro), legível a 3–5 metros.
- **Rotação automática** entre os painéis escolhidos (ex.: a cada 30 s), com uma barra de tempo discreta.
- Relógio, data, turno atual e o aviso **"dados atualizados há X s"**. Se a conexão cair, aparece um alerta bem visível, para nunca mostrar dado parado como se fosse atual.
- A tela não apaga sozinha (quando o navegador permite) e volta sozinha a funcionar se a internet cair.
- Link próprio para abrir na TV, ex.: `/dashboard/tv?painel=reator`.

## 4. Cards pensados para TV (claros e objetivos)
- **Número grande**: valor, unidade, cor do status (verde/amarelo/vermelho) e seta de tendência.
- **Semáforo de parâmetros**: lista do que está fora da margem, em destaque.
- **Equipamento**: rodando/parado, produto atual, produção do turno e tempo parado.
- **Meta x realizado** do dia ou do turno, em barra de progresso.
- **Paradas do turno**: total, tempo e principal motivo.
- **Alertas ativos**: poucos itens, com piscar suave nos críticos.
- **Gráfico de tendência** das últimas horas, com faixa mín/máx.
- Regra para TV: no máximo de 6 a 9 cards por painel, sem tabelas longas.

## Ordem sugerida (etapas seguras)
1. Modo TV, com rotação e indicador de dado atualizado. É o que dá mais resultado na TV com menos risco.
2. Vários painéis por usuário.
3. Os novos cards para TV.
4. O assistente que cria o painel a partir de texto.

## Detalhes técnicos
- Nova tabela `dashboards` (user_id, owner_id, nome, ordem, tv_rotacao_seg, tv_incluir), com RLS `user_id = auth.uid()` e tenant por `effective_owner`. Nova coluna `dashboard_id` (nullable) em `dashboard_widgets`, preenchida com o painel "Principal" de cada usuário (adicional, compatível).
- Rota `_authenticated/dashboard.tv.tsx` (fullscreen, Wake Lock API, refetch periódico, detecção de dados atrasados).
- Assistente: server function autenticada (Lovable AI) que recebe o pedido mais o catálogo de widgets e as tags do tenant, e devolve um JSON validado por zod (tipos/fontes existentes apenas). Os widgets são inseridos pelo cliente, como o usuário logado.
- Novos tipos no `widget-catalog.ts`, sem alterar os existentes.

## Estimativa de créditos (aproximada)
Etapa 1: 2–3 · Etapa 2: 2–3 · Etapa 3: 3–5 · Etapa 4: 3–5. Total de cerca de 10 a 16 créditos, que podem ser feitos por etapas.
