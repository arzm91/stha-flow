
-- Add owner_id to tag_endpoints
ALTER TABLE public.tag_endpoints ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
UPDATE public.tag_endpoints SET owner_id = 'b7b13c4e-4cc5-49b2-b820-2ceaac712618' WHERE owner_id IS NULL;
ALTER TABLE public.tag_endpoints ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.tag_endpoints ALTER COLUMN owner_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS tag_endpoints_owner_idx ON public.tag_endpoints(owner_id);

-- Add owner_id to tags_live, switch PK to (owner_id, nome)
ALTER TABLE public.tags_live ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
UPDATE public.tags_live SET owner_id = 'b7b13c4e-4cc5-49b2-b820-2ceaac712618' WHERE owner_id IS NULL;
ALTER TABLE public.tags_live ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.tags_live ALTER COLUMN owner_id SET DEFAULT auth.uid();
ALTER TABLE public.tags_live DROP CONSTRAINT tags_live_pkey;
ALTER TABLE public.tags_live ADD PRIMARY KEY (owner_id, nome);
CREATE INDEX IF NOT EXISTS tags_live_owner_idx ON public.tags_live(owner_id);

-- Replace tag_endpoints RLS: only the owner can see/manage
DROP POLICY IF EXISTS "Admins can read tag endpoints" ON public.tag_endpoints;
DROP POLICY IF EXISTS "Admins can insert tag endpoints" ON public.tag_endpoints;
DROP POLICY IF EXISTS "Admins can update tag endpoints" ON public.tag_endpoints;
DROP POLICY IF EXISTS "Admins can delete tag endpoints" ON public.tag_endpoints;
CREATE POLICY tag_endpoints_all_own ON public.tag_endpoints
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Replace tags_live RLS: only the owner can see/manage
DROP POLICY IF EXISTS "Usuários autenticados podem ler tags" ON public.tags_live;
DROP POLICY IF EXISTS "Admins can insert tags_live" ON public.tags_live;
DROP POLICY IF EXISTS "Admins can update tags_live" ON public.tags_live;
DROP POLICY IF EXISTS "Admins can delete tags_live" ON public.tags_live;
CREATE POLICY tags_live_all_own ON public.tags_live
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Update ingest_endpoint_payload to record owner_id from endpoint
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
    grupo = coalesce(excluded.grupo, public.tags_live.grupo),
    origem = excluded.origem;

  get diagnostics inserted = row_count;
  return inserted;
end;
$function$;

-- Update ingest_tags to require auth and scope by owner
CREATE OR REPLACE FUNCTION public.ingest_tags(payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  total INTEGER := 0;
  v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'auth.uid() required';
  END IF;
  INSERT INTO public.tags_live (owner_id, nome, valor, valor_num, unidade, grupo, qualidade, atualizado_em, origem)
  SELECT
    v_owner,
    (item->>'nome')::TEXT,
    NULLIF(item->>'valor',''),
    CASE WHEN item->>'valor_num' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (item->>'valor_num')::NUMERIC ELSE NULL END,
    NULLIF(item->>'unidade',''),
    NULLIF(item->>'grupo',''),
    NULLIF(item->>'qualidade',''),
    COALESCE((item->>'atualizado_em')::TIMESTAMPTZ, now()),
    COALESCE(NULLIF(item->>'origem',''), 'push')
  FROM jsonb_array_elements(payload) AS item
  ON CONFLICT (owner_id, nome) DO UPDATE SET
    valor = EXCLUDED.valor,
    valor_num = EXCLUDED.valor_num,
    qualidade = EXCLUDED.qualidade,
    atualizado_em = EXCLUDED.atualizado_em,
    unidade = COALESCE(public.tags_live.unidade, EXCLUDED.unidade),
    grupo = COALESCE(public.tags_live.grupo, EXCLUDED.grupo),
    origem = EXCLUDED.origem;
  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$function$;
