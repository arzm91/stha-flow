ALTER TABLE public.ordens_producao ADD COLUMN IF NOT EXISTS responsavel_fechamento text, ADD COLUMN IF NOT EXISTS finalizado_por uuid;
ALTER TABLE public.equipamentos ADD COLUMN IF NOT EXISTS tag_velocidade_consumo text;
ALTER TABLE public.custom_sheets ADD COLUMN IF NOT EXISTS tabela_analise boolean NOT NULL DEFAULT false;