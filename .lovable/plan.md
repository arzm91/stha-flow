
# STHApc — Plano de Implementação

Aplicação web profissional para gestão industrial (produção, estoque, qualidade, indicadores, rastreabilidade). Sistema inicia **vazio**, sem dados mockados. Backend: Lovable Cloud (Postgres + Auth real). Frontend: TanStack Start + Tailwind v4 + shadcn.

## Identidade Visual

- Tema "industrial moderno": fundo escuro (slate/zinc), acento laranja-âmbar (HSE/industrial), tipografia técnica (Inter + JetBrains Mono para números/códigos).
- Tokens semânticos em `src/styles.css` (sem cores hardcoded).
- Layout app shell: sidebar fixa colapsável + topbar com usuário/empresa.

## Banco de Dados (uma migração inicial)

Schema completo, todas tabelas com `id uuid`, `created_at`, `updated_at`, `user_id`/`owner_id` quando aplicável, RLS + GRANTs.

- `profiles` (id=auth.users, nome, empresa, email)
- `user_roles` + enum `app_role` (admin/operador) + função `has_role()` (segurança RLS sem recursão)
- `equipamentos` (codigo, nome, descricao, tipo, localizacao, status[disponivel/ocupado/parado], ativo)
- `produtos` (codigo, nome, descricao, unidade, categoria, ativo)
- `analises_cadastro` (nome, unidade, valor_min, valor_max, obrigatoria)
- `parametros_cadastro` (nome, unidade, valor_min, valor_max)
- `tanques` (codigo, nome, capacidade, unidade, produto_id)
- `ordens_producao` (numero, produto_id, equipamento_id, qtd_planejada, qtd_produzida, obs_iniciais, obs_finais, inicio_em, fim_em, status[em_andamento/finalizada], tanque_destino_id)
- `parametros_registrados` (ordem_id, parametro_id, valor, registrado_em)
- `analises_registradas` (ordem_id, analise_id, resultado, registrado_em)
- `observacoes_producao` (ordem_id, texto, registrado_em)
- `movimentacoes_estoque` (produto_id, tanque_id, tipo[entrada/saida], quantidade, origem, destino, ordem_id, ocorrido_em)

Cada tabela: RLS habilitada, políticas escopadas por `auth.uid()` (cada usuário vê seus dados — multi-tenant simples por owner_id), GRANTs para `authenticated` e `service_role`.

Trigger `set_updated_at` genérico para todas as tabelas.

## Autenticação

- Página `/auth` com tabs Login / Cadastro (Nome, Empresa, Email, Senha) + link "Recuperar senha".
- Página `/reset-password` (atualiza senha via recovery).
- Trigger `handle_new_user()` cria `profiles` automaticamente a partir do raw_user_meta_data (nome, empresa).
- Layout protegido em `src/routes/_authenticated/route.tsx` (integration-managed) — todas as rotas internas ficam abaixo dele.

## Rotas (TanStack file-based)

```
/auth                                  pública
/reset-password                        pública
/_authenticated/route.tsx              gate
  /                                    Dashboard
  /producao                            Lista equipamentos + ações
  /producao/nova                       Abrir OP
  /producao/$id                        OP em andamento (parâmetros, análises, observações, finalizar)
  /producao/$id/finalizar              Modal/etapa de finalização + destino estoque
  /estoque                             Visão geral + tanques
  /estoque/tanques/$id                 Histórico do tanque
  /estoque/movimentacao                Entrada / Saída / Expedição
  /cadastros/equipamentos
  /cadastros/equipamentos/$id          Detalhe + histórico produções
  /cadastros/produtos
  /cadastros/analises
  /cadastros/parametros
  /cadastros/tanques
  /relatorios                          Hub
  /relatorios/producao
  /relatorios/estoque
  /relatorios/qualidade
  /indicadores                         KPIs + gráficos (recharts)
  /configuracoes                       perfil, empresa, logout
```

## Dashboard

Cards clicáveis agrupados em seções (Produção, Estoque, Qualidade, Indicadores Gerais) — cada card faz query agregada e linka para a tela correspondente. Quando vazio, exibe "—" e CTA para começar (ex.: "Cadastre seu primeiro equipamento").

## Fluxos Principais

1. **Abrir OP** → cria ordem, marca equipamento `ocupado`, inicia cronômetro (cálculo via diferença de datas em queries).
2. **Em andamento** → 3 abas: Parâmetros, Análises, Observações; cada uma com formulário + lista cronológica, registros ilimitados.
3. **Finalizar** → form (qtd produzida, obs finais, seleção de tanque). Transação no servidor: atualiza ordem, libera equipamento, insere movimentação de estoque tipo `entrada` vinculada à ordem.
4. **Histórico equipamento** → lista de OPs com tempo total; clicar abre rastreabilidade completa (todos parâmetros/análises/observações).
5. **Expedição** → form de saída, baixa estoque do tanque selecionado.
6. **Histórico tanque** → entradas, saídas, saldo calculado (sum entradas − sum saídas).

Operações sensíveis (finalizar OP, abrir OP, movimentação) implementadas como `createServerFn` com `requireSupabaseAuth` para garantir atomicidade e RLS no servidor.

## Indicadores

Queries agregadas (SQL via supabase-js) renderizadas com Recharts:
- Produção diária/mensal/por equipamento/por produto
- Tempo médio de produção, eficiência (qtd_produzida/qtd_planejada)
- OEE simplificado (disponibilidade × performance × qualidade aprox.)
- Tendência por análise, desvios fora de min/max
- Giro de estoque, saldos

## Relatórios

Tabelas filtráveis (período, equipamento, produto) com export CSV (client-side).

## Componentes Compartilhados

- `AppShell` (sidebar + topbar) em `src/components/layout/`
- `KpiCard`, `EmptyState`, `DataTable` (wrap shadcn table), `PageHeader`
- Formulários com `react-hook-form` + `zod`

## Estado Vazio Real

Nenhuma seed. Listas e dashboards mostram componentes `EmptyState` específicos com CTA para a tela de cadastro relacionada.

## Entrega em Fases

Dada a extensão, vou implementar em **uma resposta única e grande**, na seguinte ordem dentro dessa resposta:

1. Design system (`styles.css`) + AppShell + Sidebar + tipos auxiliares
2. Migração SQL completa (todas tabelas + roles + RLS + GRANTs + trigger profile)
3. Autenticação (`/auth`, `/reset-password`, layout `_authenticated`)
4. Cadastros (equipamentos, produtos, análises, parâmetros, tanques) — CRUD genérico
5. Produção (lista, abrir OP, OP em andamento, finalizar, histórico)
6. Estoque (movimentações, expedição, histórico tanque)
7. Dashboard + Indicadores + Relatórios
8. Configurações + ajustes finais

## Detalhes Técnicos

- TanStack Query para reads, `useMutation` para writes
- `createServerFn` + `requireSupabaseAuth` para operações multi-tabela (finalizar OP, movimentação de estoque com ordem)
- Reads simples via `supabase` client diretamente nos componentes (RLS protege)
- Sem edge functions
- Sem dados mockados em qualquer lugar
- SEO/meta básico em `__root.tsx` (título "STHApc")

## Confirmação

Posso prosseguir com este plano? Vou implementar tudo na próxima resposta. Se quiser ajustar algo (ex.: multi-tenant por empresa em vez de por usuário, papéis adicionais, paleta diferente), me diga antes.
