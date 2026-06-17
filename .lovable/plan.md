# Refazer Tags ao Vivo

## Diagnóstico (o que está hoje no backend)

Banco e ingestão estão funcionando — não vou recriar do zero, vou consertar pontos:

- `tags_live` (5 linhas) e `tag_endpoints` (2 linhas) existem, com RLS correta.
- `POST /api/public/tags` (push) funciona — última tag chegou às 15:27 UTC hoje.
- `GET /api/public/tags/poll` (pull) roda via `pg_cron` a cada 1 min. Um dos endpoints cadastrados é a própria URL do poll (loop) e o outro retorna 403 (Cloudflare 1003 — IP direto bloqueado): são problemas de configuração feita na UI antiga, não do código.
- `UPDATE` em `tags_live` exige role `admin`; a função `handle_new_user` já dá admin no signup — então editar funciona, só não está claro na UI.

Conclusão: refaço a **interface** completa e faço **pequenos ajustes no backend** (simulação/entrada manual + validação de URL do endpoint para impedir loop).

## Plano

### 1. Backend (migração + 1 rota nova)
- Migração:
  - Tabela `tags_live`: adicionar coluna `origem` (`text`, default `'push'`) para rotular `push | pull | manual`.
  - Função `ingest_tags`: aceitar `origem` opcional no payload.
  - Função nova `delete_tag(_nome text)` — security definer, restrita a admin via `has_role`, para excluir tags da UI.
- Nova server function autenticada `simulateTags` (`createServerFn` + `requireSupabaseAuth`) que gera valores aleatórios para uma lista de nomes e chama `ingest_tags`. Usada pelo botão "Simular".
- Sem mudar schema de `tag_endpoints` nem o cron.

### 2. Página `tags.index.tsx` (nova)
Layout em três zonas:

```text
┌─────────────────────────────────────────────────────────┐
│ Header: título + indicador "ao vivo" + botões           │
│ [ + Nova tag (manual) ] [ ▶ Simular ] [ ⚙ Endpoints ]   │
├─────────────────────────────────────────────────────────┤
│ KPIs: Tags | Grupos | Fora dos limites | Última leitura │
├─────────────────────────────────────────────────────────┤
│ Filtros: busca + select de grupo + toggle "só alertas"  │
├─────────────────────────────────────────────────────────┤
│ Grid de cards agrupados por `grupo`:                    │
│  ┌─ Reator 8 ──────────────┐  ┌─ Tanque 10 ────────┐    │
│  │ R8.Temp  78.4 °C  ●good │  │ TQ10.Nivel 48.2 %  │    │
│  │ R8.Pressao 2.1 bar  ●   │  │  …                 │    │
│  └─────────────────────────┘  └─────────────────── ┘    │
└─────────────────────────────────────────────────────────┘
```

- Cada linha do card mostra nome amigável (fallback nome técnico), valor formatado, unidade, badge de qualidade, ícone de alerta se fora de limite, "há Xs" desde a última atualização (relativo). Hover revela botões Editar / Excluir.
- Tags sem grupo caem em "Sem grupo".
- Polling do React Query mantido em 2s (1s era exagero).
- Estado vazio com instruções claras (curl de push + link para Endpoints + botão "Simular").

### 3. Diálogos
- **Editar tag** (igual hoje, mas com Tabs):
  - Aba "Identificação": nome amigável, grupo, unidade.
  - Aba "Limites": valor_min, valor_max com validação cruzada.
- **Nova tag manual**: nome, nome amigável, grupo, unidade, valor inicial. Insere via RPC `ingest_tags` com `origem='manual'`.
- **Excluir**: confirmação + `delete_tag`.

### 4. Página `tags.endpoints.tsx` (reformulada)
- Card de topo "Como funciona" com dois passos (push vs pull) em vez de dois cards lado a lado confusos. URL de push com botão copiar e exemplo `curl`.
- Tabela de endpoints: badge colorida para status (OK / HTTP nnn / ERRO / nunca executado), tempo relativo da última execução, contador de tags recebidas.
- Formulário "Novo/Editar":
  - Validação client-side: bloquear URL que aponte para o próprio host (`/api/public/tags/poll`) — evita o loop atual.
  - Botão **"Testar agora"** dentro do formulário (antes de salvar) que chama `runNow` num modo dry-run e mostra status + amostra dos campos detectados.
  - Intervalo mínimo 5s, com aviso que o cron roda a cada 60s.
- Botão "Sincronizar tudo agora" no header da tabela.

### 5. Limpeza
- `tags.tsx` (layout pai) permanece com `<Outlet />`.
- Manter `formatDate`; adicionar util `formatRelative(date)` em `src/lib/format.ts`.
- Remover casts `as never` substituindo por queries tipadas com a `Database` gerada quando possível (as tabelas já estão nos types).

## Fora de escopo
- Histórico de tags (gráficos por tag) — fica para uma próxima.
- Alertas por e-mail/webhook quando fora do limite — fica para uma próxima.

Posso prosseguir?
