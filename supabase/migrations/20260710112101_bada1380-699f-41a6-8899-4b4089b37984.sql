
-- 1) Produto opcional em ordens_producao
ALTER TABLE public.ordens_producao ALTER COLUMN produto_id DROP NOT NULL;

-- 2) Capacidade nominal do equipamento
ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS capacidade_hora numeric,
  ADD COLUMN IF NOT EXISTS capacidade_dia numeric,
  ADD COLUMN IF NOT EXISTS capacidade_mes numeric,
  ADD COLUMN IF NOT EXISTS capacidade_unidade text;

-- 3) Provisionar materiais também em UPDATE quando produto_id passa de NULL para valor
DROP TRIGGER IF EXISTS trg_provisionar_ordem_materiais_upd ON public.ordens_producao;
CREATE TRIGGER trg_provisionar_ordem_materiais_upd
AFTER UPDATE OF produto_id ON public.ordens_producao
FOR EACH ROW
WHEN (OLD.produto_id IS DISTINCT FROM NEW.produto_id AND NEW.produto_id IS NOT NULL)
EXECUTE FUNCTION public.provisionar_ordem_materiais();

-- 4) Disparar auto-advance imediatamente quando OP entra em em_andamento
CREATE OR REPLACE FUNCTION public.ordens_producao_fire_auto_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'em_andamento' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      PERFORM public.auto_advance_equipamento_atividades();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_advance_equipamento_atividades failed: %', SQLERRM;
    END;
    BEGIN
      PERFORM public.auto_advance_ordens_producao();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_advance_ordens_producao failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ordens_producao_fire_auto_advance ON public.ordens_producao;
CREATE TRIGGER trg_ordens_producao_fire_auto_advance
AFTER INSERT OR UPDATE OF status ON public.ordens_producao
FOR EACH ROW
EXECUTE FUNCTION public.ordens_producao_fire_auto_advance();
