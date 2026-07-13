-- Step 1: Add 'gerente' role. Must be committed before use in policies/functions.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gerente';