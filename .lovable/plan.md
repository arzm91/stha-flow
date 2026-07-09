
# Novo /relatorios — Planilha estilo Excel

Substituir totalmente o editor visual (canvas A4) por um editor de planilha, onde cada célula pode conter valor, fórmula nativa do Excel, ou fórmula customizada que puxa dados reais do sistema.

## Experiência

**Lista `/relatorios`** — mantém cards, mas todos os relatórios agora são planilhas.
- Botões: **Novo relatório**, **Importar .xlsx**, Duplicar, Excluir.
- Remove o fluxo antigo de "modelos visuais" e "escopo/canvas".

**Editor `/relatorios/$id`** — planilha completa:
- Grid tipo Excel: colunas A–Z... (expansível), linhas numeradas, cabeçalhos fixos, seleção de célula/intervalo, copy/paste, undo/redo, mesclar células, formatação (fonte, tamanho, negrito, itálico, cor texto/fundo, alinhamento, bordas, formato numérico, moeda, %, data).
- Múltiplas abas (planilhas) por relatório.
- Barra de fórmulas no topo mostrando/editando a célula ativa.
- Botão **Recalcular** e recálculo automático quando dependências mudam.
- Botão **Inserir dado do sistema** → abre um assistente que monta a fórmula para você (fonte, filtros, coluna, agregação) e escreve na célula selecionada (pode inserir como fórmula viva OU como valor snapshot).
- Menu **Arquivo**: Salvar (auto), Exportar Excel, Exportar PDF, Exportar CSV, Importar .xlsx (substitui a aba atual ou adiciona nova).

## Fórmulas customizadas do sistema

Prefixo `STHA.` para não colidir com nativas. Exemplos:

- `=STHA.PRODUCAO.ULTIMA("Envase 1";"quantidade")` — último valor produzido no equipamento.
- `=STHA.PRODUCAO.SOMA("Envase 1";"quantidade";"2026-07-01";"2026-07-31")` — soma no período.
- `=STHA.TAG.ATUAL("TT-101")` — valor atual da tag ao vivo.
- `=STHA.TAG.HISTORICO("TT-101";"media";"2026-07-08 00:00";"2026-07-08 23:59")` — média histórica.
- `=STHA.MANUTENCAO.ABERTAS("Caldeira 1")` — nº de OS abertas.
- `=STHA.MANUTENCAO.ULTIMA("Caldeira 1";"data_conclusao")`
- `=STHA.ESTOQUE.SALDO("Produto X")`, `=STHA.TANQUE.NIVEL("TQ-01")`
- `=STHA.ANALISE.ULTIMA("pH")`, `=STHA.ANALISE.MEDIA("pH";"2026-07-01";"2026-07-31")`
- `=STHA.ORDEM.CAMPO(123;"quantidade_produzida")`

Autocomplete na barra de fórmulas com sugestão de argumentos e valores válidos (equipamentos, produtos, tanques, tags do tenant).

Cada função tem duas variantes:
- **Fórmula viva** → grava a fórmula na célula; recalcula ao abrir/recarregar.
- **Snapshot** (via assistente "Inserir dado") → grava o valor calculado no momento.

## Import de .xlsx (preservar tudo)

- Aceita .xlsx e .xls.
- Preserva: valores, fórmulas nativas do Excel, formatação (fonte, cores, bordas), larguras de coluna, alturas de linha, mesclagens, múltiplas abas.
- Não preserva: macros VBA, gráficos nativos do Excel (viram imagem estática), pivots.
- Após importar, você adiciona `=STHA.*` nas células desejadas.

## Exportação

- **Excel (.xlsx)** — gera arquivo com valores calculados no momento da exportação; fórmulas `=STHA.*` são exportadas como valores (Excel não conhece essas funções); fórmulas nativas são preservadas.
- **PDF** — renderiza a planilha (paisagem/retrato, escala automática, quebra por página) via html2canvas + jsPDF.
- **CSV** — apenas dados da aba ativa, com valores calculados.

## Arquitetura técnica

**Libs a instalar:**
- `handsontable` (community/MIT via `@handsontable/react`) — grid completo com formatação, mesclagem, fórmulas Excel via HyperFormula, undo/redo, copy/paste.
- `hyperformula` — motor de fórmulas compatível com Excel, com API para registrar funções customizadas (`STHA.*`).
- `exceljs` — leitura/escrita .xlsx preservando estilos e fórmulas nativas.
- `jspdf` + `html2canvas` — PDF a partir do grid renderizado.
- `papaparse` — CSV.

**Modelo de dados (migração):**
- Tabela `report_templates` já existe. Reaproveitar as colunas gerais (nome, descricao, tipo, updated_at, RLS). Adicionar coluna `workbook JSONB` (aba, células, formatos, mesclagens, larguras) — a coluna antiga `canvas JSONB` fica no banco por compatibilidade, ignorada pelo novo editor. Sem migração destrutiva de dados: relatórios antigos aparecem na lista como "legado" e podem ser excluídos manualmente.
- Nada muda em `report_schedules`/`report_runs`; a exportação agendada usa o novo pipeline .xlsx/PDF.

**Server functions novas (`src/lib/reports/formulas.functions.ts`)** — uma por família (`producao`, `tag`, `manutencao`, `estoque`, `tanque`, `analise`, `ordem`), todas com `requireSupabaseAuth`, RLS aplicado. O cliente envia um lote de chamadas (dedup por assinatura) e recebe os valores para o HyperFormula preencher.

**Fluxo de cálculo:**
1. Ao abrir, carrega workbook do banco.
2. Handsontable + HyperFormula renderizam.
3. HyperFormula chama funções `STHA.*` registradas como async → cliente enfileira e envia lote ao servidor.
4. Valores retornam, células atualizam.
5. Recálculo manual pelo botão ou automático quando outra célula referenciada muda.

**Salvar:** debounce 1s após edição, grava `workbook` JSONB inteiro.

## Arquivos a criar/alterar

- `src/routes/_authenticated/relatorios.$id.tsx` — substituir editor visual pelo novo `SpreadsheetEditor`.
- `src/routes/_authenticated/relatorios.index.tsx` — simplificar (remover fluxos de canvas/escopo/modelo).
- `src/components/reports/SpreadsheetEditor.tsx` (novo) — Handsontable + HyperFormula, toolbar.
- `src/components/reports/InsertSystemDataDialog.tsx` (novo) — assistente para fórmulas STHA.
- `src/lib/reports/formulas/registry.ts` (novo) — define funções STHA e as registra no HyperFormula.
- `src/lib/reports/formulas.functions.ts` (novo) — server fns que resolvem dados por lote.
- `src/lib/reports/xlsx-import.ts` (novo) — ExcelJS → workbook interno.
- `src/lib/reports/xlsx-export.ts` (novo) — workbook interno → ExcelJS.
- `src/lib/reports/pdf-export.ts` (novo) — html2canvas + jsPDF.
- Migration: adicionar coluna `workbook JSONB` em `report_templates`.

## Fora de escopo desta rodada

- Gráficos dentro da planilha (fica para depois; export .xlsx pode reintroduzir).
- Macros / scripts.
- Edição colaborativa em tempo real.
- Versionamento de planilhas.
- Substituir agendamento — continua funcionando, só passa a exportar .xlsx.

Se aprovar, começo pela migração + libs + editor base, depois fórmulas STHA, depois import/export.
