
-- 1) allow 'manutencao' status on equipamentos
ALTER TABLE public.equipamentos DROP CONSTRAINT IF EXISTS equipamentos_status_check;
ALTER TABLE public.equipamentos ADD CONSTRAINT equipamentos_status_check
  CHECK (status = ANY (ARRAY['disponivel'::text, 'ocupado'::text, 'parado'::text, 'manutencao'::text]));

-- 2) ordens_manutencao
CREATE TABLE public.ordens_manutencao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  equipamento_id UUID NOT NULL REFERENCES public.equipamentos(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('corretiva','preventiva')),
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','critica')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','concluida','cancelada')),
  preventiva_id UUID,
  agendada_para TIMESTAMPTZ,
  data_abertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_inicio TIMESTAMPTZ,
  data_conclusao TIMESTAMPTZ,
  responsavel TEXT,
  descricao_problema TEXT,
  descricao_servico TEXT,
  pecas_utilizadas TEXT,
  custo NUMERIC,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, numero)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_manutencao TO authenticated;
GRANT ALL ON public.ordens_manutencao TO service_role;
ALTER TABLE public.ordens_manutencao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant access" ON public.ordens_manutencao FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));
CREATE TRIGGER trg_om_owner BEFORE INSERT ON public.ordens_manutencao
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE TRIGGER trg_om_updated BEFORE UPDATE ON public.ordens_manutencao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_om_equip ON public.ordens_manutencao(equipamento_id);
CREATE INDEX idx_om_owner_status ON public.ordens_manutencao(owner_id, status);

-- 3) manutencao_atividades (checklist da OS)
CREATE TABLE public.manutencao_atividades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ordem_id UUID NOT NULL REFERENCES public.ordens_manutencao(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  realizada BOOLEAN NOT NULL DEFAULT false,
  observacao TEXT,
  ordem_seq INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencao_atividades TO authenticated;
GRANT ALL ON public.manutencao_atividades TO service_role;
ALTER TABLE public.manutencao_atividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant access" ON public.manutencao_atividades FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));
CREATE TRIGGER trg_ma_owner BEFORE INSERT ON public.manutencao_atividades
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE TRIGGER trg_ma_updated BEFORE UPDATE ON public.manutencao_atividades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ma_ordem ON public.manutencao_atividades(ordem_id);

-- 4) manutencao_preventivas (rotinas)
CREATE TABLE public.manutencao_preventivas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  equipamento_id UUID NOT NULL REFERENCES public.equipamentos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo_recorrencia TEXT NOT NULL DEFAULT 'tempo' CHECK (tipo_recorrencia IN ('tempo','contador_op','data_fixa')),
  intervalo_dias INTEGER,
  intervalo_op_count INTEGER,
  proxima_execucao DATE,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsavel_padrao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultima_execucao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencao_preventivas TO authenticated;
GRANT ALL ON public.manutencao_preventivas TO service_role;
ALTER TABLE public.manutencao_preventivas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant access" ON public.manutencao_preventivas FOR ALL TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()))
  WITH CHECK (owner_id = public.effective_owner(auth.uid()));
CREATE TRIGGER trg_mp_owner BEFORE INSERT ON public.manutencao_preventivas
  FOR EACH ROW EXECUTE FUNCTION public.set_effective_owner();
CREATE TRIGGER trg_mp_updated BEFORE UPDATE ON public.manutencao_preventivas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_mp_equip ON public.manutencao_preventivas(equipamento_id);
