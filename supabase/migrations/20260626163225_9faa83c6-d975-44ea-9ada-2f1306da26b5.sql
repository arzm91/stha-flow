
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'tag-endpoints-poll-every-minute';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end$$;

select cron.schedule(
  'tag-endpoints-poll-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://stha-flow.lovable.app/api/public/tags/poll?force=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tZHhmZnBlZ29saWZ2a3pydmJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzM5MDIsImV4cCI6MjA5NzI0OTkwMn0.7waUb1uFAyXpmU1KJ1lRAlO3syEXeSojyZ582ojrHaQ'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $cron$
);
