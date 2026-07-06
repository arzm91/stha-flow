# Construtor de Relatórios Personalizados

Reformulação completa da página `/relatorios` para um **builder de relatórios** onde admins criam templates reutilizáveis por toda a equipe, com filtros dinâmicos, agrupamentos, gráficos e exportação em vários formatos. Tudo isolado da lógica atual do sistema.

## O que muda para o usuário

- `/relatorios` passa a ser uma **biblioteca de relatórios salvos** + botão "Novo relatório".
- Admin abre o **construtor**, escolhe a fonte de dados (Produção, Estoque/Qualidade ou Manutenção/Automação), seleciona colunas, define filtros/agrupamentos e visualiza o resultado em tabela e gráfico.
- Qualquer usuário abre um relatório salvo, ajusta os filtros (data, equipamento, produto, status…) e exporta em **Excel, PDF, CSV ou imprime**.
- As páginas atuais de subrelatórios ficam removidas — tudo passa pelo builder.

## Fontes de dados (com campos e joins prontos)

**Produção** — `ordens_producao` + `ordem_etapas` + `equipamento_atividades` + `produtos` + `equipamentos`. Campos: nº ordem, produto, equipamento, status, início/fim, duração, etapa, tipo (matéria-prima/parâmetro/análise), valor capturado, unidade, quantidade planejada vs. real.

**Estoque e Qualidade** — `movimentacoes_estoque` + `tanques` + `tanque_ajustes_saldo` + `tanque_analises` + `analises_registradas` + `parametros_registrados`. Campos: data, tanque, produto, tipo movimentação, quantidade, saldo, análise, parâmetro, valor, dentro/fora de spec.

**Manutenção e Automação** — `ordens_manutencao` + `manutencao_atividades` + `manutencao_preventivas` + `automation_runs` + `alertas_disparos`. Campos: nº OM, equipamento, tipo, status, abertura/conclusão, tempo, executante, automação, gatilho, resultado.

## Recursos do builder

- **Colunas**: escolher, reordenar (drag), renomear label.
- **Filtros dinâmicos**: intervalo de datas + filtros por campo (equipamento, produto, status, etc.), aplicados na hora de rodar.
- **Agrupamento + agregações**: agrupar por 1–2 dimensões e agregar por SUM/AVG/COUNT/MIN/MAX/valor único.
- **Gráficos**: barra, linha ou pizza sobre a saída agrupada (opcional; oculto se não fizer sentido).
- **Preview ao vivo** enquanto configura.
- **Salvar como template** (nome + descrição). Templates ficam listados na biblioteca.

## Exportação

- **XLSX** — reaproveita `exceljs` já instalado; inclui aba de filtros aplicados e, quando houver gráfico, imagem embutida (mesma técnica de `producao-xlsx.ts`).
- **PDF** — via `jspdf` + `jspdf-autotable` (já usados no projeto).
- **CSV** — download direto client-side.
- **Impressão** — página de preview otimizada com `window.print()` e CSS `@media print`.

## Permissões

- Somente `admin` (via `has_role`) cria, edita ou apaga templates.
- Todos os usuários autenticados listam, executam e exportam.
- Consultas usam o client autenticado do Supabase → **RLS existente continua valendo** (usuário só vê o que já pode ver hoje).

## Detalhes técnicos

### Banco (1 migration)

```sql
CREATE TABLE public.relatorio_templates (
  id uuid PK default gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  fonte text NOT NULL,          -- 'producao' | 'estoque_qualidade' | 'manutencao_automacao'
  config jsonb NOT NULL,        -- { columns, filters, groupBy[], aggregations[], chart }
  created_by uuid NOT NULL,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- GRANT authenticated + service_role
-- RLS: SELECT para todos autenticados; INSERT/UPDATE/DELETE só has_role(uid,'admin')
-- Trigger updated_at
```

Nenhuma tabela existente é alterada.

### Arquitetura de código

```
src/lib/relatorios/
  sources.ts              catálogo (fonte → campos, tipos, filtros suportados)
  fetch.ts                executa a query no Supabase para cada fonte
  aggregate.ts            group-by + agregações em memória
  export-xlsx.ts          XLSX (com gráfico opcional)
  export-pdf.ts           PDF
  export-csv.ts           CSV
  types.ts

src/components/relatorios/
  ReportBuilder.tsx       painel principal (colunas / filtros / agrupamento / gráfico)
  ReportRunner.tsx        executa template salvo com filtros ajustáveis
  ReportPreview.tsx       tabela + gráfico (recharts, já no projeto)
  ColumnPicker.tsx, FilterBar.tsx, GroupByPicker.tsx, ChartConfig.tsx, ExportMenu.tsx

src/routes/_authenticated/
  relatorios.index.tsx    biblioteca de templates (substitui a atual)
  relatorios.novo.tsx     builder (admin)
  relatorios.$id.tsx      executar/editar template
  relatorios.tsx          layout com Outlet
```

Rotas atuais `relatorios.estoque.tsx`, `relatorios.producao.tsx`, `relatorios.qualidade.tsx` **serão removidas** (substituídas pelo builder).

### Segurança

- Escrita de template gated por `has_role(auth.uid(),'admin')` na RLS.
- Consultas de dados via `supabase` do cliente → RLS de cada tabela aplica normalmente.
- Nenhuma edge function nova; nenhum uso de service role.

### Impacto no restante do sistema

Zero. Nenhuma tabela ou rota fora de `/relatorios` é tocada; nenhuma dependência nova além do que já está instalado (`exceljs`, `jspdf`, `recharts`).

## Entrega em 2 etapas

1. **Migration** `relatorio_templates` + RLS.
2. Após aprovação da migration: builder, runner, biblioteca, exportadores e remoção das rotas antigas de subrelatórios.

Confirma que posso seguir por esse caminho?