# Reforma de Segurança e Acesso

## Visão geral

Consolidar controle de acesso em um **Centro de Segurança** único, adicionar o papel **gerente**, escopar alertas por destinatário, e reduzir o uso da senha admin a duas ações críticas. Multi-tenant por `effective_owner` fica intacto — nenhuma mudança nessa base.

Chat permanece restrito a admin nesta rodada (conforme sua escolha).

---

## 1. Novo papel: `gerente`

**Migration**
- Adicionar `'gerente'` ao enum `public.app_role` (ADD VALUE — não destrutivo).
- Atualizar `has_role` continua funcionando sem mudança (é genérica).
- Criar função helper `public.can_manage_users(_user uuid)` = `has_role(admin) OR has_role(gerente)`.

**Backend (`admin.functions.ts` renomeado conceitualmente para "user-management")**
- Trocar `assertAdmin` por `assertCanManageUsers` em: `listManagedUsers`, `createManagedUser`, `setUserPermissions`, `setUserResourcePermissions`, `deleteManagedUser`.
- Regras de proteção adicionadas ao gerente:
  - Só pode criar/editar/excluir usuários com papel `operador` (não pode mexer em admin nem em outros gerentes).
  - Só pode atribuir papel `operador` a novos usuários (admin continua podendo atribuir `operador` ou `gerente`).
  - Não pode alterar `created_by` de usuários alheios (regra já existe no trigger `profiles_protect_created_by` — vamos estendê-la para permitir gerente).

**Frontend**
- `usePagePermissions` passa a expor `canManageUsers` (admin OU gerente).
- `UserManagementCard`, seção "Segurança" em Configurações, e menu do sidebar liberam para gerente também.
- Novo dropdown de papel no formulário de criação: admin vê `operador`/`gerente`; gerente só vê `operador`.

---

## 2. Centro de Segurança (nova aba em Configurações)

Reorganizar a página `/configuracoes` em abas:
- **Perfil** (atual)
- **Sessão** (atual)
- **Notificações** (Push + Email templates — atuais)
- **Segurança e Acessos** ← novo, visível para admin e gerente

Dentro de "Segurança e Acessos":
- Lista de usuários da conta (reaproveita `UserManagementCard`).
- Por usuário selecionado, três painéis lado a lado:
  1. **Papel** (operador / gerente / admin, conforme quem edita).
  2. **Permissões de página** (view/edit por página — já existe).
  3. **Permissões de recurso** (equipamentos, tanques, produtos, planilhas — já existe em `user_resource_permissions`, mas hoje só é aplicado em algumas telas).

Novo hook `useResourceAccess(resourceType, resourceId)` que retorna `{ canView, canEdit }` e é usado para filtrar listas e esconder itens.

**Aplicação real do filtro por recurso** (hoje inconsistente):
- Página `/producao` (lista de equipamentos): filtra pelos IDs permitidos.
- Página `/producao/$id` (acompanhamento): bloqueia se o equipamento não estiver na lista.
- Página `/estoque` e `/estoque/tanques/$id`: filtra tanques.
- Página `/cadastros/produtos`: filtra produtos.
- Página `/tabelas`: filtra planilhas.
- Dashboard: já filtra widgets por permissão de página; adicionar filtro por recurso quando o widget é escopado a um equipamento/tanque.

Admin e gerente com permissão em tudo veem tudo (comportamento atual preservado).

---

## 3. Alertas escopados por destinatário

**Regra escolhida:** "só quem está listado como destinatário no alerta". Isso vale para alertas com E sem equipamento.

**Backend (sem mudança de schema)**
- `alertas.email_recipients` (uuid[]) e `alertas.push_recipients` (uuid[]) já existem e definem quem recebe **e-mail/push**.
- Nova coluna simples na leitura da tela: consideramos a mesma lista para **quem vê no popup e no sino de alertas**. Nenhuma coluna nova necessária.

**Frontend**
- `AlertasFloatingPopup` e a lista de alertas: filtrar `alertas_disparos` pelo `alerta_id` cujo `email_recipients` OU `push_recipients` contém o `auth.uid()` atual. Admin vê tudo (opt-out via toggle na UI).
- Novo policy de leitura em `alertas_disparos`: usuário lê disparo se é admin OU está nos recipients do alerta associado.
- Alertas sem `alerta_id` (rotinas semanais que caem em `alertas_disparos` via `rotinas_atividades`): usar `rotinas_atividades.email_recipients` da mesma forma.

---

## 4. Simplificação da senha admin

**Manter** o `AdminPasswordGate` apenas em:
- Excluir usuário (`deleteManagedUser`).
- Alterar papel de um usuário (nova ação de admin).

**Remover** de todos os outros pontos onde `guardAdmin(...)` é chamado hoje (exclusões de ordens, tanques, cadastros, planilhas, etc.). Nessas ações, o controle passa a ser 100% pela permissão `can_edit` no `user_permissions` — o botão de excluir só aparece para quem pode editar.

Auditoria: vou rodar `rg "guardAdmin\("` para listar todos os usos e converter caso a caso.

---

## 5. O que NÃO muda nesta rodada

- Chat permanece só para admin.
- Multi-tenant `effective_owner`.
- `handle_new_user` trigger.
- Templates de e-mail, push, edge functions.
- Nenhuma tabela é deletada.

---

## Detalhes técnicos

**Migrations (2 arquivos):**

1. `security-role-gerente.sql`:
   - `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente';`
   - `CREATE FUNCTION public.can_manage_users(_user uuid) RETURNS boolean ...`
   - Atualizar `profiles_protect_created_by` para aceitar gerente com restrições.

2. `alertas-disparos-rls-por-destinatario.sql`:
   - Nova policy SELECT em `alertas_disparos`:
     ```sql
     USING (
       public.has_role(auth.uid(), 'admin')
       OR EXISTS (SELECT 1 FROM public.alertas a
                  WHERE a.id = alertas_disparos.alerta_id
                    AND (auth.uid() = ANY(a.email_recipients)
                         OR auth.uid() = ANY(a.push_recipients)))
     )
     ```
   - Manter policy de admin/owner atual como fallback.

**Arquivos frontend afetados (~12):**
- `src/hooks/usePagePermissions.ts` — adicionar `canManageUsers`, `isGerente`.
- `src/hooks/useResourcePermissions.ts` — já existe, expandir para ser usado em todas as listagens.
- `src/lib/permissions/admin.functions.ts` — trocar assertions.
- `src/components/configuracoes/UserManagementCard.tsx` — dropdown de papel.
- `src/routes/_authenticated/configuracoes.tsx` — reorganizar em abas.
- `src/components/alertas/AlertasFloatingPopup.tsx` — filtro por recipient.
- `src/routes/_authenticated/alertas.index.tsx` — mesmo filtro.
- `src/routes/_authenticated/producao.index.tsx`, `producao.$id.tsx` — filtro de equipamentos.
- `src/routes/_authenticated/estoque.index.tsx`, `estoque.tanques.$id.tsx` — filtro de tanques.
- `src/routes/_authenticated/cadastros.produtos.tsx` — filtro de produtos.
- `src/routes/_authenticated/tabelas.index.tsx` — filtro de planilhas.
- Todos os arquivos que usam `guardAdmin(...)` — remover chamada, deixar apenas onde a exclusão é de usuário/papel.
- `src/components/PageAccessGuard.tsx` — reconhecer gerente para páginas admin-only relevantes (configurações fica liberada; algumas subseções podem ficar bloqueadas se você quiser).

**Segurança preservada:**
- RLS continua ativo em todas as tabelas.
- Escopo por `owner_id`/`effective_owner` intacto.
- Gerente é validado tanto no client (esconder UI) quanto no server (assertions e RLS).

---

## Riscos e como mitigo

- **Enum `ALTER TYPE ADD VALUE`** não pode rodar em transação com uso do valor. Migration em duas etapas: (1) ADD VALUE, (2) próximas migrations podem usar.
- **Filtro de alertas por recipient** pode fazer alertas antigos "sumirem" para admin. Solução: admin sempre vê tudo; toggle "mostrar apenas meus" na UI.
- **Remover senha admin** de exclusões pode assustar. Vamos manter o `ConfirmDialog` (confirmação simples "tem certeza?") — só cai a senha.

## Ordem de execução

1. Migration do enum `gerente` + `can_manage_users`.
2. Migration da policy de `alertas_disparos`.
3. Backend: `admin.functions.ts` aceita gerente.
4. Frontend: hooks + Centro de Segurança em abas.
5. Aplicar filtro de recurso nas listagens.
6. Remover `guardAdmin` de tudo exceto exclusão/alteração de usuário.
7. Verificar build (`tsgo`) e testar login com um operador de teste.

Posso começar?
