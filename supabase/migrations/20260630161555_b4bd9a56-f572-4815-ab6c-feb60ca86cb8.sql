ALTER TABLE public.produto_atividades
  ADD COLUMN IF NOT EXISTS gatilhos jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.produto_atividades.gatilhos IS 'Lista de gatilhos opcionais por tag. Cada item: { tipo: "inicio"|"fim", tag_nome: text, operador: "gt"|"lt"|"gte"|"lte"|"eq"|"neq"|"change", valor: number|null }';