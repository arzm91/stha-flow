DO $$
BEGIN
  PERFORM cron.unschedule('tag-endpoints-fire');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('tag-endpoints-process');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('poll-tag-endpoints');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'tag-endpoints-app-poll',
  '2 seconds',
  $$
  SELECT net.http_post(
    url := 'https://id-preview--f7e74e7f-ede1-4001-bbfc-b1e56be5c017.lovable.app/api/public/tags/poll',
    headers := '{"Content-Type":"application/json","Accept":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tZHhmZnBlZ29saWZ2a3pydmJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzM5MDIsImV4cCI6MjA5NzI0OTkwMn0.7waUb1uFAyXpmU1KJ1lRAlO3syEXeSojyZ582ojrHaQ"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);