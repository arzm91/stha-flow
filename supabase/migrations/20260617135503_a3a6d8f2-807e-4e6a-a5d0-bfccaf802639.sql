CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- remove agendamento anterior se existir
DO $$
BEGIN
  PERFORM cron.unschedule('poll-tag-endpoints');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'poll-tag-endpoints',
  '* * * * *',
  $$
  SELECT net.http_get(
    url := 'https://project--f7e74e7f-ede1-4001-bbfc-b1e56be5c017.lovable.app/api/public/tags/poll'
  );
  $$
);