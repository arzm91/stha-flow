
-- Fecha etapas legadas que foram auto-abertas quando a ordem iniciou (sem gatilho real).
-- Não deleta dados: apenas marca como canceladas para não contarem como "em andamento".
UPDATE public.ordem_etapas
SET finalizado_em = iniciado_em,
    duracao_seg = 0,
    observacao = COALESCE(NULLIF(observacao,''),'') || ' · [cancelada: sem gatilho — fechada automaticamente]'
WHERE finalizado_em IS NULL
  AND equipamento_atividade_id IS NOT NULL
  AND (
    observacao = '[equip: auto]'
    OR (
      observacao = '[equip: aguardando variação]'
      AND (estab_fase IS NULL OR estab_fase = 'aguardando_atividade')
      AND EXISTS (
        SELECT 1 FROM public.ordem_etapas x
        WHERE x.ordem_id = ordem_etapas.ordem_id
          AND x.equipamento_atividade_id = ordem_etapas.equipamento_atividade_id
          AND x.id <> ordem_etapas.id
          AND x.iniciado_em > ordem_etapas.iniciado_em
      )
    )
  );
