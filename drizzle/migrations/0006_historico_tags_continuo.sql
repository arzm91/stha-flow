ALTER TABLE public.producao_tag_historico ALTER COLUMN ordem_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pth_equip_tag_ts ON public.producao_tag_historico (equipamento_id, tag_nome, registrado_em DESC);

CREATE OR REPLACE FUNCTION public.record_producao_tag_historico()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  last_ts TIMESTAMPTZ;
BEGIN
  IF NEW.valor_num IS NULL THEN RETURN NEW; END IF;
  FOR r IN
    SELECT e.id AS equipamento_id, e.owner_id,
      (SELECT op.id FROM public.ordens_producao op
        WHERE op.equipamento_id = e.id AND op.status = 'em_andamento'
        ORDER BY op.inicio_em DESC NULLS LAST LIMIT 1) AS ordem_id
    FROM public.equipamentos e
    WHERE e.ativo = true AND e.owner_id = NEW.owner_id
      AND (NEW.nome = ANY(e.tag_nomes) OR NEW.nome = e.tag_producao_total
           OR NEW.nome = e.tag_velocidade_producao OR NEW.nome = e.tag_velocidade_consumo)
  LOOP
    SELECT MAX(registrado_em) INTO last_ts FROM public.producao_tag_historico
    WHERE equipamento_id = r.equipamento_id AND tag_nome = NEW.nome;
    IF last_ts IS NULL OR COALESCE(NEW.atualizado_em, now()) - last_ts >= interval '10 seconds' THEN
      INSERT INTO public.producao_tag_historico
        (owner_id, ordem_id, equipamento_id, tag_nome, valor_num, valor, unidade, registrado_em)
      VALUES (r.owner_id, r.ordem_id, r.equipamento_id, NEW.nome, NEW.valor_num, NEW.valor, NEW.unidade,
         COALESCE(NEW.atualizado_em, now()));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;