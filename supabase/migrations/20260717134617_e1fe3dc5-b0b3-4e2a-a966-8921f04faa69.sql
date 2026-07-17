SELECT cron.unschedule('tags-acumulador-tick');

SELECT cron.schedule(
  'tags-acumulador-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--f7e74e7f-ede1-4001-bbfc-b1e56be5c017-dev.lovable.app/api/public/tags/acumulador-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);