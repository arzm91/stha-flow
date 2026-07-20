
ALTER TABLE public.custom_sheets
  ADD COLUMN IF NOT EXISTS auto_on_producao_finish boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.custom_sheets_autofill_on_finish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sheet RECORD;
  col jsonb;
  ckey text;
  src text;
  tag_nome text;
  val jsonb;
  data jsonb;
  dur_min int;
BEGIN
  IF NEW.status <> 'finalizada' THEN RETURN NEW; END IF;
  IF OLD.status = 'finalizada' THEN RETURN NEW; END IF;
  IF NEW.equipamento_id IS NULL THEN RETURN NEW; END IF;

  FOR sheet IN
    SELECT id, columns, owner_id
    FROM public.custom_sheets
    WHERE auto_on_producao_finish = true
      AND equipamento_ids IS NOT NULL
      AND NEW.equipamento_id = ANY(equipamento_ids)
      AND owner_id = NEW.owner_id
  LOOP
    data := '{}'::jsonb;
    FOR col IN SELECT * FROM jsonb_array_elements(COALESCE(sheet.columns, '[]'::jsonb))
    LOOP
      ckey := col->>'key';
      src := col->>'source';
      tag_nome := col->>'tagNome';
      val := 'null'::jsonb;
      IF src = 'op_numero' THEN
        val := to_jsonb(NEW.numero);
      ELSIF src = 'quantidade' THEN
        val := to_jsonb(NEW.qtd_produzida);
      ELSIF src = 'duracao_min' THEN
        IF NEW.inicio_em IS NOT NULL AND NEW.fim_em IS NOT NULL THEN
          dur_min := EXTRACT(EPOCH FROM (NEW.fim_em - NEW.inicio_em))/60;
          val := to_jsonb(dur_min);
        END IF;
      ELSIF src = 'inicio_em' THEN
        IF NEW.inicio_em IS NOT NULL THEN
          val := to_jsonb(to_char(NEW.inicio_em, 'YYYY-MM-DD'));
        END IF;
      ELSIF src = 'fim_em' THEN
        IF NEW.fim_em IS NOT NULL THEN
          val := to_jsonb(to_char(NEW.fim_em, 'YYYY-MM-DD'));
        END IF;
      ELSIF src = 'produto_nome' THEN
        val := to_jsonb((SELECT nome FROM public.produtos WHERE id = NEW.produto_id));
      ELSIF src = 'tag' AND tag_nome IS NOT NULL AND tag_nome <> '' THEN
        SELECT to_jsonb(valor_num) INTO val FROM public.tags_live
          WHERE owner_id = NEW.owner_id AND nome = tag_nome
          LIMIT 1;
        IF val IS NULL THEN val := 'null'::jsonb; END IF;
      END IF;
      IF ckey IS NOT NULL THEN
        data := data || jsonb_build_object(ckey, val);
      END IF;
    END LOOP;
    INSERT INTO public.custom_sheet_rows (sheet_id, data, owner_id, created_by)
    VALUES (sheet.id, data, NEW.owner_id, NEW.owner_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_custom_sheets_autofill ON public.ordens_producao;
CREATE TRIGGER trg_custom_sheets_autofill
  AFTER UPDATE OF status ON public.ordens_producao
  FOR EACH ROW
  EXECUTE FUNCTION public.custom_sheets_autofill_on_finish();

REVOKE ALL ON FUNCTION public.custom_sheets_autofill_on_finish() FROM PUBLIC, anon, authenticated;
