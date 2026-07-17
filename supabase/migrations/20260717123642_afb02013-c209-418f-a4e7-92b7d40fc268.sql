
-- 1) Snapshots diários de tags
CREATE TABLE public.tag_snapshots_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  tag_nome text NOT NULL,
  hora_ref text NOT NULL,
  dia_ref date NOT NULL,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  valor_num numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, tag_nome, hora_ref, dia_ref)
);

CREATE INDEX tag_snapshots_diarios_owner_tag_dia_idx
  ON public.tag_snapshots_diarios (owner_id, tag_nome, dia_ref DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_snapshots_diarios TO authenticated;
GRANT ALL ON public.tag_snapshots_diarios TO service_role;

ALTER TABLE public.tag_snapshots_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant reads own snapshots"
  ON public.tag_snapshots_diarios
  FOR SELECT TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()));

CREATE POLICY "managers manage all snapshots"
  ON public.tag_snapshots_diarios
  FOR ALL TO authenticated
  USING (public.can_manage_users(auth.uid()))
  WITH CHECK (public.can_manage_users(auth.uid()));

-- 2) Novos campos em tags_calculadas para tipo "delta em janela"
ALTER TABLE public.tags_calculadas
  ALTER COLUMN formula DROP NOT NULL,
  ADD COLUMN tipo text NOT NULL DEFAULT 'formula',
  ADD COLUMN snapshot_tag_nome text,
  ADD COLUMN snapshot_hora text,
  ADD COLUMN snapshot_janela_dias integer,
  ADD COLUMN ultimo_valor_calc numeric,
  ADD COLUMN ultimo_valor_calc_em timestamptz;

ALTER TABLE public.tags_calculadas
  ADD CONSTRAINT tags_calculadas_tipo_check
    CHECK (tipo IN ('formula','delta_janela'));
