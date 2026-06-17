
-- =========================================================
-- STHApc — schema inicial
-- =========================================================

-- Função genérica updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  empresa TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, empresa, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data ->> 'empresa',
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin'::public.app_role);
  RETURN NEW;
END;
$$;

-- =========================================================
-- ROLES
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'operador');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Trigger no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- EQUIPAMENTOS
-- =========================================================
CREATE TABLE public.equipamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT,
  localizacao TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','ocupado','parado')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipamentos TO authenticated;
GRANT ALL ON public.equipamentos TO service_role;
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipamentos_all_own" ON public.equipamentos
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_equip_updated BEFORE UPDATE ON public.equipamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- PRODUTOS
-- =========================================================
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  unidade TEXT NOT NULL,
  categoria TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos_all_own" ON public.produtos
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_prod_updated BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- ANALISES CADASTRO
-- =========================================================
CREATE TABLE public.analises_cadastro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  unidade TEXT,
  valor_min NUMERIC,
  valor_max NUMERIC,
  obrigatoria BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analises_cadastro TO authenticated;
GRANT ALL ON public.analises_cadastro TO service_role;
ALTER TABLE public.analises_cadastro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analises_cad_all_own" ON public.analises_cadastro
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_anlc_updated BEFORE UPDATE ON public.analises_cadastro
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- PARAMETROS CADASTRO
-- =========================================================
CREATE TABLE public.parametros_cadastro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  unidade TEXT,
  valor_min NUMERIC,
  valor_max NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parametros_cadastro TO authenticated;
GRANT ALL ON public.parametros_cadastro TO service_role;
ALTER TABLE public.parametros_cadastro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "param_cad_all_own" ON public.parametros_cadastro
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_prmc_updated BEFORE UPDATE ON public.parametros_cadastro
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- TANQUES
-- =========================================================
CREATE TABLE public.tanques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  capacidade NUMERIC,
  unidade TEXT,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tanques TO authenticated;
GRANT ALL ON public.tanques TO service_role;
ALTER TABLE public.tanques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tanques_all_own" ON public.tanques
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_tank_updated BEFORE UPDATE ON public.tanques
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- ORDENS DE PRODUCAO
-- =========================================================
CREATE TABLE public.ordens_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  equipamento_id UUID NOT NULL REFERENCES public.equipamentos(id) ON DELETE RESTRICT,
  qtd_planejada NUMERIC NOT NULL,
  qtd_produzida NUMERIC,
  obs_iniciais TEXT,
  obs_finais TEXT,
  inicio_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim_em TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','finalizada')),
  tanque_destino_id UUID REFERENCES public.tanques(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, numero)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_producao TO authenticated;
GRANT ALL ON public.ordens_producao TO service_role;
ALTER TABLE public.ordens_producao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "op_all_own" ON public.ordens_producao
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_op_updated BEFORE UPDATE ON public.ordens_producao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_op_equip ON public.ordens_producao(equipamento_id);
CREATE INDEX idx_op_owner_status ON public.ordens_producao(owner_id, status);

-- =========================================================
-- PARAMETROS REGISTRADOS
-- =========================================================
CREATE TABLE public.parametros_registrados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ordem_id UUID NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  parametro_id UUID NOT NULL REFERENCES public.parametros_cadastro(id) ON DELETE RESTRICT,
  valor NUMERIC NOT NULL,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parametros_registrados TO authenticated;
GRANT ALL ON public.parametros_registrados TO service_role;
ALTER TABLE public.parametros_registrados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prmr_all_own" ON public.parametros_registrados
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_prmr_updated BEFORE UPDATE ON public.parametros_registrados
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_prmr_ordem ON public.parametros_registrados(ordem_id);

-- =========================================================
-- ANALISES REGISTRADAS
-- =========================================================
CREATE TABLE public.analises_registradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ordem_id UUID NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  analise_id UUID NOT NULL REFERENCES public.analises_cadastro(id) ON DELETE RESTRICT,
  resultado NUMERIC NOT NULL,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analises_registradas TO authenticated;
GRANT ALL ON public.analises_registradas TO service_role;
ALTER TABLE public.analises_registradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anlr_all_own" ON public.analises_registradas
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_anlr_updated BEFORE UPDATE ON public.analises_registradas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_anlr_ordem ON public.analises_registradas(ordem_id);

-- =========================================================
-- OBSERVACOES PRODUCAO
-- =========================================================
CREATE TABLE public.observacoes_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ordem_id UUID NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.observacoes_producao TO authenticated;
GRANT ALL ON public.observacoes_producao TO service_role;
ALTER TABLE public.observacoes_producao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obs_all_own" ON public.observacoes_producao
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_obs_updated BEFORE UPDATE ON public.observacoes_producao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_obs_ordem ON public.observacoes_producao(ordem_id);

-- =========================================================
-- MOVIMENTACOES ESTOQUE
-- =========================================================
CREATE TABLE public.movimentacoes_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  tanque_id UUID REFERENCES public.tanques(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0),
  origem TEXT,
  destino TEXT,
  ordem_id UUID REFERENCES public.ordens_producao(id) ON DELETE SET NULL,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes_estoque TO authenticated;
GRANT ALL ON public.movimentacoes_estoque TO service_role;
ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mov_all_own" ON public.movimentacoes_estoque
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_mov_updated BEFORE UPDATE ON public.movimentacoes_estoque
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_mov_tanque ON public.movimentacoes_estoque(tanque_id);
CREATE INDEX idx_mov_produto ON public.movimentacoes_estoque(produto_id);
