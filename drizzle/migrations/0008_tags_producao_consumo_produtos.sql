ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tag_total_producao text,
  ADD COLUMN IF NOT EXISTS tag_consumo text,
  ADD COLUMN IF NOT EXISTS consumo_modo text NOT NULL DEFAULT 'totalizador',
  ADD COLUMN IF NOT EXISTS consumo_fator numeric NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.record_producao_tag_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
           OR NEW.nome = e.tag_velocidade_producao OR NEW.nome = e.tag_velocidade_consumo
           OR EXISTS (SELECT 1 FROM public.produtos p WHERE p.equipamento_id = e.id
                      AND (p.tag_total_producao = NEW.nome OR p.tag_clp = NEW.nome))
           OR EXISTS (SELECT 1 FROM public.produtos p
                      JOIN public.produto_receita pr ON pr.produto_id = p.id
                      JOIN public.produtos mp ON mp.id = pr.materia_prima_id
                      WHERE p.equipamento_id = e.id
                        AND (mp.tag_consumo = NEW.nome OR pr.tag_consumo_nome = NEW.nome)))
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