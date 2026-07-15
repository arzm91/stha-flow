CREATE OR REPLACE FUNCTION public.delete_ordem_producao_cascade(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'gerente')) THEN
    RAISE EXCEPTION 'forbidden: requires admin or gerente';
  END IF;

  DELETE FROM public.parametros_registrados WHERE ordem_id = _id;
  DELETE FROM public.analises_registradas   WHERE ordem_id = _id;
  DELETE FROM public.observacoes_producao   WHERE ordem_id = _id;
  DELETE FROM public.paradas_equipamento    WHERE ordem_producao_id = _id;
  DELETE FROM public.ordem_materiais        WHERE ordem_id = _id;
  DELETE FROM public.ordem_etapas           WHERE ordem_id = _id;
  DELETE FROM public.movimentacoes_estoque  WHERE ordem_id = _id;
  DELETE FROM public.producao_tag_historico WHERE ordem_id = _id;
  UPDATE public.manutencao_atividades SET ordem_id = NULL WHERE ordem_id = _id;
  DELETE FROM public.ordens_producao        WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_ordem_producao_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_ordem_producao_cascade(uuid) TO authenticated;