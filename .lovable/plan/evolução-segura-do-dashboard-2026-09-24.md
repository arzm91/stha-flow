# Evolução segura do Dashboard

## Objetivo
Transformar o dashboard em uma visão operacional confiável, rica e personalizável, mantendo os dashboards individuais, posições, tamanhos e configurações já salvas.

## Etapa 1 — Confiabilidade dos dados
- Corrigir indicadores que podem somar registros incompletos ou considerar ordens fora do estado correto.
- Padronizar o período “hoje” no fuso de São Paulo.
- Corrigir medidores com mínimo diferente de zero.
- Tratar falhas de leitura separadamente de valores realmente zerados.
- Levar agregações volumosas para consultas próprias no banco, evitando limites silenciosos e recálculos pesados no navegador.
- Investigar e corrigir a interrupção do histórico das tags, preservando os registros existentes.

## Etapa 2 — Períodos, filtros e comparações
- Adicionar período geral: hoje, ontem, 7 dias, 30 dias, mês atual e personalizado.
- Permitir que cada card siga o período geral ou mantenha um período próprio.
- Adicionar filtros compatíveis por equipamento, produto, tanque, turno e status.
- Mostrar comparação com o período anterior, variação percentual e horário da última atualização.
- Manter o comportamento atual como padrão para cards antigos que não tenham as novas opções.

## Etapa 3 — Novas análises relacionadas
- Criar cards de produção por equipamento/produto, produção versus paradas, produção versus consumo, qualidade por equipamento/produto e alertas ligados à produção.
- Adicionar tendência temporal, meta versus realizado, Pareto, distribuição e linha do tempo operacional.
- Oferecer soma, média, mínimo, máximo, contagem e último valor para fontes compatíveis.
- Incluir minigráficos individuais em cards de uma ou várias tags quando houver histórico.

## Etapa 4 — Experiência visual e configuração
- Reorganizar a inclusão de cards com pesquisa, categorias e prévia.
- Aplicar cores semânticas, legendas, unidades, metas e limites aos gráficos.
- Melhorar tipografia, estados vazios, indisponibilidade e adaptação ao redimensionamento.
- Manter arrastar, redimensionar, congelar e tela cheia; adicionar duplicação de cards sem alterar os existentes.

## Segurança e compatibilidade
- Toda leitura continuará restrita à empresa do usuário pelas regras multitenant existentes.
- Agregações protegidas serão executadas como o usuário autenticado, sem acesso privilegiado desnecessário.
- Alterações de dados serão aditivas e compatíveis com configurações antigas.
- Cada etapa será validada separadamente antes da seguinte, incluindo números, erros, tema claro/escuro e tamanhos de tela.

## Validação
- Conferir indicadores contra consultas diretas no banco para o mesmo período.
- Confirmar que layouts existentes permanecem idênticos após atualizar e reabrir a página.
- Testar filtros, comparações, ausência de dados, falhas de leitura e atualização automática.
- Validar a experiência real autenticada assim que houver uma sessão disponível na prévia.
