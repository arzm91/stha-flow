
ALTER TABLE public.tags_live
  ADD COLUMN IF NOT EXISTS valor_num_bruto numeric,
  ADD COLUMN IF NOT EXISTS escala_fator numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS escala_op text NOT NULL DEFAULT 'multiplicar';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tags_live_escala_op_chk'
  ) THEN
    ALTER TABLE public.tags_live
      ADD CONSTRAINT tags_live_escala_op_chk
      CHECK (escala_op IN ('multiplicar', 'dividir'));
  END IF;
END $$;

-- Backfill: valor atual vira o "bruto" (escala 1 = identidade)
UPDATE public.tags_live
   SET valor_num_bruto = valor_num
 WHERE valor_num_bruto IS NULL AND valor_num IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tags_live_apply_scale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Detecta leitura bruta chegando via ingest (ingest sempre mexe em valor_num)
  IF TG_OP = 'INSERT' THEN
    IF NEW.valor_num_bruto IS NULL THEN
      NEW.valor_num_bruto := NEW.valor_num;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.valor_num IS DISTINCT FROM OLD.valor_num
       AND NEW.valor_num_bruto IS NOT DISTINCT FROM OLD.valor_num_bruto THEN
      NEW.valor_num_bruto := NEW.valor_num;
    END IF;
  END IF;

  -- Recalcula sempre o valor exibido a partir do bruto + escala
  IF NEW.valor_num_bruto IS NOT NULL THEN
    IF COALESCE(NEW.escala_op, 'multiplicar') = 'dividir' THEN
      IF COALESCE(NEW.escala_fator, 1) = 0 THEN
        NEW.valor_num := NEW.valor_num_bruto;
      ELSE
        NEW.valor_num := NEW.valor_num_bruto / NEW.escala_fator;
      END IF;
    ELSE
      NEW.valor_num := NEW.valor_num_bruto * COALESCE(NEW.escala_fator, 1);
    END IF;
    NEW.valor := NEW.valor_num::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tags_live_apply_scale ON public.tags_live;
CREATE TRIGGER trg_tags_live_apply_scale
BEFORE INSERT OR UPDATE ON public.tags_live
FOR EACH ROW EXECUTE FUNCTION public.tags_live_apply_scale();
