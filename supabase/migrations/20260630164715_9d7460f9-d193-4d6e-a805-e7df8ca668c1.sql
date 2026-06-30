
CREATE OR REPLACE FUNCTION public.ingest_endpoint_payload(p_endpoint_id uuid, p_endpoint_name text, p_payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  arr jsonb;
  inserted int := 0;
  v_owner uuid;
begin
  if p_payload is null then return 0; end if;
  select owner_id into v_owner FROM public.tag_endpoints WHERE id = p_endpoint_id;
  if v_owner is null then return 0; end if;

  if jsonb_typeof(p_payload) = 'array' then
    arr := p_payload;
  elsif jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload->'tags') = 'array' then
    arr := p_payload->'tags';
  elsif jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload->'data') = 'array' then
    arr := p_payload->'data';
  elsif jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload->'items') = 'array' then
    arr := p_payload->'items';
  elsif jsonb_typeof(p_payload) = 'object' then
    arr := (
      select coalesce(jsonb_agg(
        case when jsonb_typeof(v) = 'object' then v || jsonb_build_object('nome', k)
             else jsonb_build_object('nome', k, 'valor', v) end
      ), '[]'::jsonb)
      from jsonb_each(p_payload) as e(k, v)
    );
  else
    return 0;
  end if;

  insert into public.tags_live (owner_id, nome, valor, valor_num, unidade, grupo, qualidade, atualizado_em, origem)
  select
    v_owner,
    coalesce(item->>'nome', item->>'name', item->>'tag'),
    case when item ? 'valor' then item->>'valor' when item ? 'value' then item->>'value' else null end,
    case
      when (item->>'valor') ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'valor')::numeric
      when (item->>'value') ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'value')::numeric
      else null
    end,
    nullif(coalesce(item->>'unidade', item->>'unit'), ''),
    coalesce(nullif(coalesce(item->>'grupo', item->>'group'), ''), p_endpoint_name),
    nullif(coalesce(item->>'qualidade', item->>'quality'), ''),
    now(),
    'endpoint'
  from jsonb_array_elements(arr) as item
  where coalesce(item->>'nome', item->>'name', item->>'tag') is not null
  on conflict (owner_id, nome) do update set
    valor = excluded.valor,
    valor_num = excluded.valor_num,
    qualidade = excluded.qualidade,
    atualizado_em = excluded.atualizado_em,
    unidade = coalesce(public.tags_live.unidade, excluded.unidade),
    grupo = coalesce(public.tags_live.grupo, excluded.grupo),
    origem = excluded.origem;

  get diagnostics inserted = row_count;
  return inserted;
end;
$function$;
