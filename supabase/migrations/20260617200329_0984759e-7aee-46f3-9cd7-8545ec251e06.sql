
-- Ensure extensions
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- Tracking table: pending pg_net requests per endpoint
create table if not exists public.tag_endpoint_requests (
  request_id bigint primary key,
  endpoint_id uuid not null references public.tag_endpoints(id) on delete cascade,
  fired_at timestamptz not null default now(),
  processed boolean not null default false
);

grant select, insert, update, delete on public.tag_endpoint_requests to service_role;
alter table public.tag_endpoint_requests enable row level security;

-- No direct access from clients; only SECURITY DEFINER functions touch it.
-- Policies intentionally restrictive
drop policy if exists "deny all tag_endpoint_requests" on public.tag_endpoint_requests;
create policy "deny all tag_endpoint_requests"
  on public.tag_endpoint_requests for all
  to authenticated
  using (false) with check (false);

-- 1) Fire requests for due active endpoints
create or replace function public.poll_tag_endpoints_fire()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  rec record;
  req_id bigint;
  fired int := 0;
begin
  for rec in
    select id, url, headers, intervalo_segundos, ultima_execucao
    from public.tag_endpoints
    where ativo = true
      and (
        ultima_execucao is null
        or now() - ultima_execucao >= make_interval(secs => greatest(intervalo_segundos, 1))
      )
  loop
    begin
      select net.http_get(
        url := rec.url,
        headers := coalesce(rec.headers, '{}'::jsonb) || jsonb_build_object('Accept','application/json'),
        timeout_milliseconds := 8000
      ) into req_id;

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

-- Helper: normalize a JSON payload into rows and ingest into tags_live
create or replace function public.ingest_endpoint_payload(p_endpoint_id uuid, p_endpoint_name text, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  arr jsonb;
  inserted int := 0;
begin
  if p_payload is null then
    return 0;
  end if;

  if jsonb_typeof(p_payload) = 'array' then
    arr := p_payload;
  elsif jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload->'tags') = 'array' then
    arr := p_payload->'tags';
  elsif jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload->'data') = 'array' then
    arr := p_payload->'data';
  elsif jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload->'items') = 'array' then
    arr := p_payload->'items';
  elsif jsonb_typeof(p_payload) = 'object' then
    -- treat as { name: value, ... } map
    arr := (
      select coalesce(jsonb_agg(
        case
          when jsonb_typeof(v) = 'object' then v || jsonb_build_object('nome', k)
          else jsonb_build_object('nome', k, 'valor', v)
        end
      ), '[]'::jsonb)
      from jsonb_each(p_payload) as e(k, v)
    );
  else
    return 0;
  end if;

  insert into public.tags_live (nome, valor, valor_num, unidade, grupo, qualidade, atualizado_em, origem)
  select
    coalesce(item->>'nome', item->>'name', item->>'tag') as nome,
    case when item ? 'valor' then item->>'valor'
         when item ? 'value' then item->>'value'
         else null end as valor,
    case
      when (item->>'valor') ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'valor')::numeric
      when (item->>'value') ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'value')::numeric
      else null
    end as valor_num,
    nullif(coalesce(item->>'unidade', item->>'unit'), '') as unidade,
    coalesce(nullif(coalesce(item->>'grupo', item->>'group'), ''), p_endpoint_name) as grupo,
    nullif(coalesce(item->>'qualidade', item->>'quality'), '') as qualidade,
    now() as atualizado_em,
    'endpoint' as origem
  from jsonb_array_elements(arr) as item
  where coalesce(item->>'nome', item->>'name', item->>'tag') is not null
  on conflict (nome) do update set
    valor = excluded.valor,
    valor_num = excluded.valor_num,
    qualidade = excluded.qualidade,
    atualizado_em = excluded.atualizado_em,
    unidade = coalesce(public.tags_live.unidade, excluded.unidade),
    grupo = coalesce(excluded.grupo, public.tags_live.grupo),
    origem = excluded.origem;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- 2) Process completed pg_net responses
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
    limit 50
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

  -- Cleanup old processed rows (>5 min)
  delete from public.tag_endpoint_requests
  where processed = true and fired_at < now() - interval '5 minutes';

  return processed_count;
end;
$$;

-- 3) Manual sync RPC: fires single endpoint and waits for response (up to ~6s)
create or replace function public.sync_tag_endpoint_now(p_endpoint_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  ep record;
  req_id bigint;
  resp record;
  attempts int := 0;
  payload jsonb;
  ingested int;
begin
  select id, nome, url, headers into ep from public.tag_endpoints where id = p_endpoint_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'endpoint not found');
  end if;

  select net.http_get(
    url := ep.url,
    headers := coalesce(ep.headers, '{}'::jsonb) || jsonb_build_object('Accept','application/json'),
    timeout_milliseconds := 8000
  ) into req_id;

  -- poll for response up to 6 seconds
  loop
    select status_code, content, error_msg into resp from net._http_response where id = req_id;
    exit when found;
    attempts := attempts + 1;
    if attempts > 60 then exit; end if;
    perform pg_sleep(0.1);
  end loop;

  if not found then
    update public.tag_endpoints
    set ultima_execucao = now(), ultimo_status = 'TIMEOUT', ultimo_erro = 'sem resposta em 6s'
    where id = ep.id;
    return jsonb_build_object('ok', false, 'error', 'timeout');
  end if;

  if resp.error_msg is not null then
    update public.tag_endpoints
    set ultima_execucao = now(), ultimo_status = 'ERRO', ultimo_erro = left(resp.error_msg,500)
    where id = ep.id;
    return jsonb_build_object('ok', false, 'error', resp.error_msg);
  end if;

  if resp.status_code is null or resp.status_code < 200 or resp.status_code >= 300 then
    update public.tag_endpoints
    set ultima_execucao = now(), ultimo_status = 'HTTP '||coalesce(resp.status_code::text,'NULL'),
        ultimo_erro = left(coalesce(resp.content,''),500)
    where id = ep.id;
    return jsonb_build_object('ok', false, 'status', resp.status_code, 'body', left(coalesce(resp.content,''),500));
  end if;

  begin
    payload := resp.content::jsonb;
  exception when others then
    update public.tag_endpoints
    set ultima_execucao = now(), ultimo_status = 'ERRO PARSE', ultimo_erro = left(SQLERRM,500)
    where id = ep.id;
    return jsonb_build_object('ok', false, 'error', 'invalid json');
  end;

  ingested := public.ingest_endpoint_payload(ep.id, ep.nome, payload);
  update public.tag_endpoints
  set ultima_execucao = now(), ultimo_status = 'OK '||ingested||' tags',
      ultimo_erro = null, tags_recebidas = ingested
  where id = ep.id;

  return jsonb_build_object('ok', true, 'count', ingested);
end;
$$;

-- Allow authenticated admins to call the manual RPC
revoke all on function public.sync_tag_endpoint_now(uuid) from public;
grant execute on function public.sync_tag_endpoint_now(uuid) to authenticated;

-- Schedule pg_cron jobs every 2 seconds
do $$
declare
  jid bigint;
begin
  for jid in select jobid from cron.job where jobname in ('tag-endpoints-fire','tag-endpoints-process','poll-tag-endpoints')
  loop
    perform cron.unschedule(jid);
  end loop;
end;
$$;

select cron.schedule('tag-endpoints-fire', '2 seconds', $$select public.poll_tag_endpoints_fire();$$);
select cron.schedule('tag-endpoints-process', '2 seconds', $$select public.poll_tag_endpoints_process();$$);
