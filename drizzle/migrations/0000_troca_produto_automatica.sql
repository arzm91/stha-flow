ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS troca_auto_ativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS troca_tag_produto text,
  ADD COLUMN IF NOT EXISTS troca_produto_0_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS troca_produto_1_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS troca_tag_quantidade text,
  ADD COLUMN IF NOT EXISTS troca_qtd_modo text NOT NULL DEFAULT 'direto';

CREATE OR REPLACE FUNCTION public.tags_live_troca_produto_auto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e record; op record; v_novo uuid; v_qtd numeric; v_prev numeric;
BEGIN
  IF NEW.valor_num IS NULL OR NEW.valor_num IS NOT DISTINCT FROM NEW.valor_num_prev AND TG_OP = 'UPDATE' AND OLD.valor_num IS NOT DISTINCT FROM NEW.valor_num THEN
    RETURN NEW;
  END IF;
  FOR e IN SELECT * FROM equipamentos
    WHERE owner_id = NEW.owner_id AND troca_auto_ativa AND troca_tag_produto = NEW.nome
      AND troca_produto_0_id IS NOT NULL AND troca_produto_1_id IS NOT NULL
  LOOP
    IF round(NEW.valor_num) = 0 THEN v_novo := e.troca_produto_0_id;
    ELSIF round(NEW.valor_num) = 1 THEN v_novo := e.troca_produto_1_id;
    ELSE CONTINUE; END IF;
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
      VALUES (op.id, op.produto_id, v_novo, greatest(v_qtd, 0), now(), 'Troca automática pela tag ' || NEW.nome || ' = ' || round(NEW.valor_num), op.owner_id);
      UPDATE ordens_producao SET produto_id = v_novo WHERE id = op.id;
    END LOOP;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'troca automatica falhou: %', SQLERRM;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.tags_live_troca_produto_auto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tags_live_troca_produto ON public.tags_live;
CREATE TRIGGER trg_tags_live_troca_produto AFTER INSERT OR UPDATE OF valor_num ON public.tags_live
  FOR EACH ROW EXECUTE FUNCTION public.tags_live_troca_produto_auto();