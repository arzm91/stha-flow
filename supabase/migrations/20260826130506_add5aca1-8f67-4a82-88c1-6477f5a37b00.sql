-- Helper: verifica se um campo de expressão cron (5 campos) casa com um valor
create or replace function public._cron_field_matches(p_field text, p_val int)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  part text;
  m text[];
  lo int; hi int; step int;
begin
  if p_field is null then return false; end if;
  foreach part in array string_to_array(p_field, ',') loop
    part := btrim(part);
    if part = '*' then return true; end if;
    m := regexp_match(part, '^\*/(\d+)$');
    if m is not null then
      step := m[1]::int;
      if step >= 1 and (p_val % step) = 0 then return true; end if;
    end if;
    m := regexp_match(part, '^(\d+)-(\d+)(?:/(\d+))?$');
    if m is not null then
      lo := m[1]::int; hi := m[2]::int; step := coalesce(m[3]::int, 1);
      if step < 1 then step := 1; end if;
      if p_val >= lo and p_val <= hi and ((p_val - lo) % step) = 0 then return true; end if;
    end if;
    m := regexp_match(part, '^(\d+)$');
    if m is not null and m[1]::int = p_val then return true; end if;
  end loop;
  return false;
end $$;

revoke all on function public._cron_field_matches(text, int) from anon, authenticated;
grant execute on function public._cron_field_matches(text, int) to service_role;

-- Dispatcher de gatilhos do tipo agendamento (schedule), avaliado a cada minuto
-- no fuso America/Sao_Paulo. Cria a execução apenas para o fluxo cujo horário é devido.
create or replace function public.dispatch_automation_schedules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  fired int := 0;
  v_now timestamptz := now();
  v_local timestamp := now() at time zone 'America/Sao_Paulo';
  v_min int := extract(minute from v_local)::int;
  v_hour int := extract(hour from v_local)::int;
  v_dom int := extract(day from v_local)::int;
  v_mon int := extract(month from v_local)::int;
  v_dow int := extract(isodow from v_local)::int % 7; -- cron: 0 = domingo
  parts text[];
begin
  for f in
    select id, owner_id, trigger_config, requires_approval, graph, last_triggered_at
    from public.automation_flows
    where ativo = true and trigger_type = 'schedule'
  loop
    parts := regexp_split_to_array(btrim(coalesce(f.trigger_config->>'cron', '')), '\s+');
    if coalesce(array_length(parts, 1), 0) <> 5 then continue; end if;

    if not (
         public._cron_field_matches(parts[1], v_min)
     and public._cron_field_matches(parts[2], v_hour)
     and public._cron_field_matches(parts[3], v_dom)
     and public._cron_field_matches(parts[4], v_mon)
     and (public._cron_field_matches(parts[5], v_dow)
          or (v_dow = 0 and public._cron_field_matches(parts[5], 7)))
    ) then continue; end if;

    -- evita disparo duplicado dentro do mesmo minuto
    if f.last_triggered_at is not null
       and date_trunc('minute', f.last_triggered_at at time zone 'America/Sao_Paulo')
           = date_trunc('minute', v_local) then continue; end if;

    insert into public.automation_runs(flow_id, owner_id, status, trigger_context, planned_actions, trigger_fired_at)
    values (
      f.id,
      f.owner_id,
      case when f.requires_approval then 'pending_approval' else 'approved' end,
      jsonb_build_object(
        'evento', 'agendamento',
        'cron', f.trigger_config->>'cron',
        'disparado_em', v_now
      ),
      coalesce(f.graph, jsonb_build_object('nodes', '[]'::jsonb, 'edges', '[]'::jsonb)),
      v_now
    );
    update public.automation_flows set last_triggered_at = v_now where id = f.id;
    fired := fired + 1;
  end loop;
  return fired;
end $$;

revoke all on function public.dispatch_automation_schedules() from anon, authenticated;
grant execute on function public.dispatch_automation_schedules() to service_role;

-- Jobs a cada minuto (idempotente: remove versão anterior se existir)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'automation-schedule-dispatch') then
    perform cron.unschedule('automation-schedule-dispatch');
  end if;
  if exists (select 1 from cron.job where jobname = 'tags-calc-tick') then
    perform cron.unschedule('tags-calc-tick');
  end if;
end $$;

select cron.schedule('automation-schedule-dispatch', '* * * * *', $job$SELECT public.dispatch_automation_schedules();$job$);

select cron.schedule('tags-calc-tick', '* * * * *', $job$
  SELECT net.http_post(
    url := 'https://project--f7e74e7f-ede1-4001-bbfc-b1e56be5c017.lovable.app/api/public/tags/calc-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$job$);