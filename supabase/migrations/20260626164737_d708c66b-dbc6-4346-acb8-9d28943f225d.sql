create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.tag_endpoint_requests (
  request_id bigint primary key,
  endpoint_id uuid not null references public.tag_endpoints(id) on delete cascade,
  fired_at timestamptz not null default now(),
  processed boolean not null default false
);

grant select, insert, update, delete on public.tag_endpoint_requests to service_role;
alter table public.tag_endpoint_requests enable row level security;

drop policy if exists "deny all tag_endpoint_requests" on public.tag_endpoint_requests;
create policy "deny all tag_endpoint_requests"
  on public.tag_endpoint_requests
  for all
  to authenticated
  using (false)
  with check (false);

create or replace function public.poll_tag_endpoints_fire()
returns integer
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  rec record;
  req_id bigint;
  fired int := 0;
  v_method text;
begin
  for rec in
    select id, url, metodo, headers, body, intervalo_segundos, ultima_execucao
    from public.tag_endpoints
    where ativo = true
      and url ~* '^https?://'
      and (
        ultima_execucao is null
        or now() - ultima_execucao >= make_interval(secs => greatest(coalesce(intervalo_segundos, 60), 1))
      )
    order by coalesce(ultima_execucao, 'epoch'::timestamptz) asc
    limit 100
  loop
    begin
      v_method := upper(coalesce(nullif(rec.metodo, ''), 'GET'));

      if v_method = 'POST' then
        select net.http_post(
          url := rec.url,
          body := coalesce(nullif(rec.body, '')::jsonb, '{}'::jsonb),
          headers := coalesce(rec.headers, '{}'::jsonb) || jsonb_build_object('Accept', 'application/json', 'Content-Type', 'application/json'),
          timeout_milliseconds := 15000
        ) into req_id;
      else
        select net.http_get(
          url := rec.url,
          headers := coalesce(rec.headers, '{}'::jsonb) || jsonb_build_object('Accept', 'application/json'),
          timeout_milliseconds := 15000
        ) into req_id;
      end if;

      insert into public.tag_endpoint_requests(request_id, endpoint_id)
      values (req_id, rec.id)
      on conflict (request_id) do nothing;

      fired := fired + 1;
    exception when others then
      update public.tag_endpoints
      set ultima_execucao = now(),
          ultimo_status = 'ERRO',
          ultimo_erro = left(SQLERRM, 500)
      where id = rec.id;
    end;
  end loop;

  return fired;
end;
$$;

create or replace function public.poll_tag_endpoints_process()
returns integer
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  rec record;
  ep record;
  payload jsonb;
  ingested int;
  processed_count int := 0;
begin
  for rec in
    select r.request_id, r.endpoint_id, resp.status_code, resp.content, resp.error_msg
    from public.tag_endpoint_requests r
    join net._http_response resp on resp.id = r.request_id
    where r.processed = false
    order by r.fired_at asc
    limit 100
  loop
    select id, nome into ep from public.tag_endpoints where id = rec.endpoint_id;
    if not found then
      update public.tag_endpoint_requests set processed = true where request_id = rec.request_id;
      continue;
    end if;

    if rec.error_msg is not null then
      update public.tag_endpoints
      set ultima_execucao = now(),
          ultimo_status = 'ERRO',
          ultimo_erro = left(rec.error_msg, 500)
      where id = ep.id;
    elsif rec.status_code is null or rec.status_code < 200 or rec.status_code >= 300 then
      update public.tag_endpoints
      set ultima_execucao = now(),
          ultimo_status = 'HTTP ' || coalesce(rec.status_code::text, 'NULL'),
          ultimo_erro = left(coalesce(rec.content, ''), 500)
      where id = ep.id;
    else
      begin
        payload := rec.content::jsonb;
        ingested := public.ingest_endpoint_payload(ep.id, ep.nome, payload);
        update public.tag_endpoints
        set ultima_execucao = now(),
            ultimo_status = 'OK ' || ingested || ' tags',
            ultimo_erro = null,
            tags_recebidas = ingested
        where id = ep.id;
      exception when others then
        update public.tag_endpoints
        set ultima_execucao = now(),
            ultimo_status = 'ERRO PARSE',
            ultimo_erro = left(SQLERRM, 500)
        where id = ep.id;
      end;
    end if;

    update public.tag_endpoint_requests set processed = true where request_id = rec.request_id;
    processed_count := processed_count + 1;
  end loop;

  delete from public.tag_endpoint_requests
  where processed = true and fired_at < now() - interval '10 minutes';

  update public.tag_endpoint_requests r
  set processed = true
  where processed = false
    and fired_at < now() - interval '2 minutes'
    and not exists (select 1 from net._http_response resp where resp.id = r.request_id);

  return processed_count;
end;
$$;

revoke all on function public.poll_tag_endpoints_fire() from public, anon, authenticated;
revoke all on function public.poll_tag_endpoints_process() from public, anon, authenticated;
grant execute on function public.poll_tag_endpoints_fire() to service_role;
grant execute on function public.poll_tag_endpoints_process() to service_role;

do $$
declare
  jid bigint;
begin
  for jid in
    select jobid from cron.job
    where jobname in (
      'tag-endpoints-poll-every-minute',
      'tag-endpoints-app-poll',
      'poll-tag-endpoints',
      'tag-endpoints-fire',
      'tag-endpoints-process'
    )
  loop
    perform cron.unschedule(jid);
  end loop;
end;
$$;

select cron.schedule('tag-endpoints-fire', '2 seconds', $$select public.poll_tag_endpoints_fire();$$);
select cron.schedule('tag-endpoints-process', '2 seconds', $$select public.poll_tag_endpoints_process();$$);