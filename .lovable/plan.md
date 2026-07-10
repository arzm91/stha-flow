## Objetivo

Resolver três pedidos na produção:

1. Coleta e processos iniciando automaticamente quando a OP começa (sem depender de abrir a tela).
2. Produto opcional na OP (equipamento pode operar sem produto associado).
3. Capacidades nominais no equipamento (hora/dia/mês) refletidas no acompanhamento.

---

## 1) Iniciar coleta/processos automaticamente

**Diagnóstico**
- Coleta de tags (`producao_tag_historico`) e execução de atividades (`auto_advance_equipamento_atividades`) já rodam via trigger + cron server-side.
- Porém há um atraso perceptível: o cron dispara a cada 10s e depende do próximo update de tag para o trigger encaixar. Quando a OP nasce "programada" e vira "em_andamento" por automação, nada dispara imediatamente o `auto_advance` — só o próximo tick de cron.
- Além disso, `auto_advance_ordens_producao` filtra `produto_id IS NOT NULL` (importante para o item 2 também).

**Ação**
- Criar trigger `AFTER UPDATE OF status ON ordens_producao` (também `AFTER INSERT`) que, quando `NEW.status = 'em_andamento'`, chama `public.auto_advance_equipamento_atividades()` na hora — assim as etapas abertas por gatilho de "início" ou por estabilização são criadas imediatamente.
- Também dispara `auto_advance_ordens_producao()` (para OPs com produto e receita clássica).
- Nada muda no cron; ele continua como rede de segurança.

## 2) Produto opcional na OP

**Schema**
- `ALTER TABLE public.ordens_producao ALTER COLUMN produto_id DROP NOT NULL;` (verificar antes; se já for nullable, pular).
- `provisionar_ordem_materiais` já checa `IF NEW.produto_id IS NULL THEN RETURN NEW`, ok.
- `auto_advance_ordens_producao` já pula sem produto; mantém.

**UI**
- `producao.nova.tsx`: campo produto vira opcional (label "Produto (opcional)"), remove `required`, permite salvar vazio (`produto_id: produtoId || null`).
- `producao.$id.tsx`: adicionar botão "Vincular produto" quando `produto_id` for null, abrindo select de produto e atualizando a OP. Após vincular, o provisionamento de materiais é acionado (podemos chamar manualmente re-provisionar ou apenas invalidar; o trigger `provisionar_ordem_materiais` já responde a INSERT — para UPDATE, adicionaremos o trigger também em UPDATE quando `produto_id` mudar de null para valor).
- Ao finalizar OP sem produto: o registro em `movimentacoes_estoque` só ocorre se houver `tanque_destino_id` e `produto_id`; mantemos a lógica existente já protegida.

## 3) Capacidade nominal do equipamento

**Schema**
- Adicionar colunas em `public.equipamentos`:
  - `capacidade_hora numeric`
  - `capacidade_dia numeric`
  - `capacidade_mes numeric`
  - `capacidade_unidade text` (ex: "kg", "un", "L")

**UI cadastro**
- `cadastros.equipamentos.tsx`: adicionar 4 campos no formulário do CrudTable (numéricos + unidade).

**UI acompanhamento (`producao.$id.tsx`)**
- Novo card compacto **"Capacidade nominal vs. real"** exibindo:
  - Capacidade/hora nominal · produção real média/hora desde `inicio_em` (via `tag_producao_total` se existir, senão via `qtd_produzida`).
  - Progresso do dia e do mês (produção acumulada do equipamento no período / capacidade correspondente).
  - Barra de eficiência (real / nominal * 100%).
- Só aparece se ao menos uma capacidade estiver definida.

---

## Arquivos afetados

**Migração SQL** (1 arquivo novo em `supabase/migrations/`)
- Torna `produto_id` opcional em `ordens_producao`.
- Adiciona colunas de capacidade em `equipamentos`.
- Cria trigger `AFTER INSERT OR UPDATE OF status ON ordens_producao` chamando `auto_advance_*` quando entra em `em_andamento`.
- Ajusta trigger `provisionar_ordem_materiais` para também rodar em UPDATE quando `produto_id` muda de null para valor.

**Frontend**
- `src/routes/_authenticated/cadastros.equipamentos.tsx` — 4 novos campos.
- `src/routes/_authenticated/producao.nova.tsx` — produto opcional.
- `src/routes/_authenticated/producao.$id.tsx` — botão "Vincular produto" + novo card de capacidade nominal.

**Fora de escopo**
- Não mexe em relatórios, alertas, automações ou schema de outras tabelas.
- Não altera as receitas de produto — apenas o vínculo tardio dispara o provisionamento existente.
