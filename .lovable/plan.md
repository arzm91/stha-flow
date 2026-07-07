# Novo módulo de Relatórios

Substituir totalmente a página `/relatorios` por um construtor visual de relatórios com dados reais do sistema, exportação e agendamento.

## O que muda na experiência

**Lista de relatórios (`/relatorios`)**
- Grid de cards: nome, descrição, tipo (Manutenção / Produção / Personalizado), última atualização.
- Botões: **Novo relatório em branco**, **Novo a partir de modelo** (OS Manutenção / Produtividade Diária), Duplicar, Editar, Agendar, Exportar (PDF/CSV), Excluir.
- Filtro por associação (equipamento, produto, manutenção).

**Editor (`/relatorios/$id`)**
- Canvas A4 (retrato/paisagem) com zoom, régua e grid de alinhamento.
- Barra lateral esquerda com blocos arrastáveis:
  - **Texto / Título / Parágrafo** (fonte, tamanho, cor, alinhamento)
  - **Imagem / Logomarca** (upload em storage)
  - **Linha divisória / Espaçador**
  - **Campo dinâmico** (`{{data_hoje}}`, `{{nome_equipamento}}`, `{{ordem_numero}}`, etc.)
  - **Tabela de dados** (escolhe fonte + colunas + filtros)
  - **Gráfico** (barras, linhas, pizza) sobre uma fonte de dados
  - **KPI / Indicador** (número grande + label + tendência)
  - **Assinatura** (campo em branco para assinar)
- Barra lateral direita: propriedades do bloco selecionado (posição, tamanho, cor, fonte, borda, fonte de dados).
- Topo: nome do relatório, tema (cor primária + fonte), associações (equipamento/produto/manutenção — múltiplas), salvar, pré-visualizar, exportar.
- Arrastar, redimensionar, alinhar, duplicar, deletar, camadas (frente/trás), desfazer/refazer.

**Fontes de dados disponíveis** (blocos de tabela/gráfico/KPI puxam daqui)
- Ordens de produção (com filtros de período, status, produto, equipamento)
- Equipamentos e atividades
- Ordens de manutenção e manutenções preventivas
- Produtos e receitas
- Análises registradas
- Tags ao vivo / histórico de tags
- Rotinas e disparos de alertas

Cada fonte tem um seletor de colunas, período (últimos 7/30 dias, mês atual, personalizado) e filtros básicos. Todos os fetches respeitam RLS do tenant.

**Modelos prontos (seed)**
- **OS de Manutenção** — cabeçalho com logo, dados do equipamento, descrição do serviço, materiais, tempo, técnico responsável, assinaturas.
- **Produtividade Diária** — cabeçalho com data/turno, KPIs de produção, gráfico de barras por equipamento, tabela de ordens concluídas, observações.

Ambos ficam disponíveis em "Novo a partir de modelo" e podem ser duplicados livremente.

**Exportação**
- **PDF** — renderiza o canvas fielmente (mesmo layout, cores, fontes).
- **Excel/CSV** — exporta as tabelas de dados usadas no relatório (uma aba/arquivo por bloco de tabela).

**Agendamento e envio por e-mail**
- Cada relatório pode ter N agendas: frequência (diária/semanal/mensal), horário, dias da semana, destinatários (multi-seleção da lista de usuários), template de e-mail (reutiliza os já cadastrados).
- No horário marcado, o sistema gera o PDF, faz upload no storage e enfileira e-mail com link + anexo (usa a fila `transactional_emails` já em produção).

## Fases de entrega (nesta rodada)

**Fase 1 — Fundação (esta entrega)**
1. Migration: apaga `relatorio_templates` + `relatorio_turno_eventos` antigos, cria:
   - `report_templates` (nome, descrição, tipo, tema JSON, canvas JSON, page_size, associações array)
   - `report_associations` (relatório ↔ equipamento/produto/manutenção)
   - `report_schedules` (relatório, cron/frequência, destinatários, template email, ativo)
   - `report_runs` (histórico de execução: quando rodou, PDF gerado, status, erro)
   - Bucket de storage `report-assets` (logos, imagens) e `report-exports` (PDFs gerados)
   - Todas com RLS por `effective_owner(auth.uid())` e GRANTs corretos
2. Seed dos 2 modelos prontos como registros marcados `is_system_template = true`.

**Fase 2 — Editor visual**
3. Nova página `/relatorios` (lista) e `/relatorios/$id` (editor) sob `_authenticated`.
4. Componentes de canvas usando `dnd-kit` + `react-rnd` para arrastar/redimensionar.
5. Blocos: Texto, Imagem, Divisória, Espaçador, Campo dinâmico, Tabela, Gráfico, KPI, Assinatura.
6. Painel de propriedades por bloco + tema global (cor primária, fonte).
7. Undo/redo via `zustand` com histórico.

**Fase 3 — Dados**
8. Server functions `report-data.functions.ts` com uma função por fonte (produção, equipamentos, manutenção, produtos, análises, tags). Todas com `requireSupabaseAuth`, filtros e projeção segura.
9. Blocos de Tabela/Gráfico/KPI consomem essas fontes via TanStack Query.

**Fase 4 — Exportação**
10. PDF: `html2pdf.js` no cliente sobre o canvas (respeita CSS e imagens).
11. CSV: exporta tabelas do relatório com `papaparse`.

**Fase 5 — Agendamento por e-mail**
12. Server route `/api/public/relatorios/dispatch` (autenticada por apikey no header).
13. Trigger/pg_cron: varre `report_schedules` a cada 5 min, chama a rota.
14. A rota gera o PDF via headless render server-side (fallback: envia link para gerar sob demanda), enfileira email com `enqueue_email` e registra em `report_runs`.
15. UI de agenda: modal no editor + aba "Agendas" no card do relatório.

## Segurança e limites

- Toda tabela nova terá RLS por tenant (`effective_owner(auth.uid()) = effective_owner(owner_id)`), admin scope para gerenciar, usuários com permissão de relatórios para ver.
- Storage buckets privados, URLs assinadas de curta duração para download.
- Sem impacto nas páginas existentes — só a rota `/relatorios` é substituída.
- Módulo de e-mail e usuários já existentes são reaproveitados (nada novo em `email_*`).

## Detalhes técnicos

- Rotas: `src/routes/_authenticated/relatorios.index.tsx` (lista) e `src/routes/_authenticated/relatorios.$id.tsx` (editor). Removo o(s) arquivo(s) atuais.
- Estado do editor: `zustand` + JSON serializado em `report_templates.canvas` (`{ pages: [{ blocks: [{id, type, x, y, w, h, props}] }] }`).
- Libs a instalar: `@dnd-kit/core`, `react-rnd`, `html2pdf.js`, `papaparse`, `recharts` (já presente), `zustand` (verificar).
- Server fns novos em `src/lib/reports/*.functions.ts`.
- Route pública para agenda: `src/routes/api/public/relatorios.dispatch.ts` com verificação por `apikey` header (Supabase anon key) — mesmo padrão já usado em alertas.
- Cron via `pg_cron` chamando a rota (5 min).
- Migração destrutiva das tabelas antigas conforme escolhido ("apagar tudo").

## Fora de escopo (fases futuras)

- Import de PDF/imagem como fundo de template
- Import de planilhas Excel como base
- Assinatura eletrônica com validação
- Fluxo de aprovação multi-nível de relatórios
- Versionamento visual de templates
