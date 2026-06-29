do $$
declare
  jid bigint;
begin
  for jid in
    select jobid from cron.job
    where jobname = 'tag-endpoints-backend-poll'
  loop
    perform cron.unschedule(jid);
  end loop;
end;
$$;

select cron.schedule(
  'tag-endpoints-backend-poll',
  '2 seconds',
  $cron$
  select net.http_post(
    url := 'https://omdxffpegolifvkzrvbi.supabase.co/functions/v1/tags-poll?force=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tZHhmZnBlZ29saWZ2a3pydmJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzM5MDIsImV4cCI6MjA5NzI0OTkwMn0.7waUb1uFAyXpmU1KJ1lRAlO3syEXeSojyZ582ojrHaQ'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);