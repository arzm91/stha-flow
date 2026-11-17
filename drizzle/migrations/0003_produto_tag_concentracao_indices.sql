ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS concentracao numeric,
  ADD COLUMN IF NOT EXISTS equipamento_id uuid REFERENCES public.equipamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tag_clp text,
  ADD COLUMN IF NOT EXISTS tag_valor_ativacao smallint;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS indices_config jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.tags_live_troca_produto_auto()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  e record; op record; v_novo uuid; v_qtd numeric; v_prev numeric; v_bit int;
BEGIN
  IF NEW.valor_num IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.valor_num IS NOT DISTINCT FROM NEW.valor_num THEN RETURN NEW; END IF;
  v_bit := round(NEW.valor_num);
  IF v_bit NOT IN (0,1) THEN RETURN NEW; END IF;
  FOR e IN SELECT * FROM equipamentos eq
    WHERE eq.owner_id = NEW.owner_id AND eq.troca_auto_ativa
      AND (eq.troca_tag_produto = NEW.nome OR EXISTS (
        SELECT 1 FROM produtos p WHERE p.equipamento_id = eq.id AND p.tag_clp = NEW.nome))
  LOOP
    v_novo := NULL;
    SELECT p.id INTO v_novo FROM produtos p
      WHERE p.equipamento_id = e.id AND p.tag_clp = NEW.nome AND p.tag_valor_ativacao = v_bit AND p.ativo
      ORDER BY p.updated_at DESC LIMIT 1;
    IF v_novo IS NULL AND e.troca_tag_produto = NEW.nome THEN
      v_novo := CASE WHEN v_bit = 0 THEN e.troca_produto_0_id ELSE e.troca_produto_1_id END;
    END IF;
    CONTINUE WHEN v_novo IS NULL;
    FOR op IN SELECT id, produto_id, owner_id FROM ordens_producao
      WHERE equipamento_id = e.id AND status = 'em_andamento' AND owner_id = NEW.owner_id
    LOOP
      CONTINUE WHEN op.produto_id = v_novo OR op.produto_id IS NULL;
      v_qtd := 0;
      IF e.troca_tag_quantidade IS NOT NULL THEN
        SELECT valor_num INTO v_qtd FROM tags_live WHERE owner_id = NEW.owner_id AND nome = e.troca_tag_quantidade;
        v_qtd := coalesce(v_qtd, 0);
        IF e.troca_qtd_modo = 'totalizador' THEN
          SELECT coalesce(sum(qtd_produto_anterior),0) INTO v_prev FROM ordem_trocas_produto WHERE ordem_id = op.id;
          v_qtd := v_qtd - v_prev;
        END IF;
      END IF;
      INSERT INTO ordem_trocas_produto(ordem_id, produto_anterior_id, produto_novo_id, qtd_produto_anterior, ocorrido_em, observacao, owner_id)
      VALUES (op.id, op.produto_id, v_novo, greatest(v_qtd, 0), now(), 'Troca automática pela tag ' || NEW.nome || ' = ' || v_bit, op.owner_id);
      UPDATE ordens_producao SET produto_id = v_novo WHERE id = op.id;
    END LOOP;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'troca automatica falhou: %', SQLERRM;
  RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.tags_live_troca_produto_auto() FROM PUBLIC, anon, authenticated;