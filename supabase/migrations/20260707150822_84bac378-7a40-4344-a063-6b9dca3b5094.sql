
ALTER TABLE public.custom_sheets
  ADD COLUMN IF NOT EXISTS equipamento_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS custom_sheets_equipamento_ids_idx
  ON public.custom_sheets USING GIN (equipamento_ids);

-- Índice em custom_sheet_rows para lookup por período (produção)
CREATE INDEX IF NOT EXISTS custom_sheet_rows_created_at_idx
  ON public.custom_sheet_rows (created_at DESC);
