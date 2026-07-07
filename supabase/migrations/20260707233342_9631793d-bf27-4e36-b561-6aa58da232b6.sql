SET LOCAL lock_timeout = '5s';

DROP INDEX IF EXISTS public.idx_pth_owner;

CREATE INDEX IF NOT EXISTS idx_pth_ordem_registrado
  ON public.producao_tag_historico (ordem_id, registrado_em DESC);