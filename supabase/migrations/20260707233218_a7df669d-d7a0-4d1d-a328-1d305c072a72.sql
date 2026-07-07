-- Limpeza inicial
DELETE FROM public.producao_tag_historico
WHERE registrado_em < now() - interval '14 days';

-- Agenda retenção diária
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'producao_tag_historico_retention_14d') THEN
    PERFORM cron.unschedule('producao_tag_historico_retention_14d');
  END IF;
END $$;

SELECT cron.schedule(
  'producao_tag_historico_retention_14d',
  '0 3 * * *',
  $$DELETE FROM public.producao_tag_historico WHERE registrado_em < now() - interval '14 days';$$
);