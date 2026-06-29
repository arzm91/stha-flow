create or replace function public.ignore_tag_endpoint_platform_403()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ultimo_status = 'HTTP 403'
     and coalesce(new.ultimo_erro, '') ilike '%error code: 1003%'
  then
    new.ultima_execucao := old.ultima_execucao;
    new.ultimo_status := old.ultimo_status;
    new.ultimo_erro := old.ultimo_erro;
    new.tags_recebidas := old.tags_recebidas;
  end if;
  return new;
end;
$$;

revoke execute on function public.ignore_tag_endpoint_platform_403() from public, anon, authenticated;
grant execute on function public.ignore_tag_endpoint_platform_403() to service_role;

drop trigger if exists trg_ignore_tag_endpoint_platform_403 on public.tag_endpoints;
create trigger trg_ignore_tag_endpoint_platform_403
before update on public.tag_endpoints
for each row
execute function public.ignore_tag_endpoint_platform_403();