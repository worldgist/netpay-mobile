-- Recreate cable_tv_plans so Plustive bouquets can be stored for the app.
CREATE TABLE IF NOT EXISTS public.cable_tv_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  package_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  api_code TEXT NOT NULL,
  original_price NUMERIC,
  custom_price NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  vending_provider TEXT NOT NULL DEFAULT 'smeplug',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cable_tv_plans_vending_api_code_key
  ON public.cable_tv_plans (vending_provider, api_code);

CREATE INDEX IF NOT EXISTS idx_cable_tv_plans_provider
  ON public.cable_tv_plans (provider);

CREATE INDEX IF NOT EXISTS idx_cable_tv_plans_is_active
  ON public.cable_tv_plans (is_active);

ALTER TABLE public.cable_tv_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Authenticated users can view active cable tv plans"
ON public.cable_tv_plans
FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Admins can view all cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Admins can view all cable tv plans"
ON public.cable_tv_plans
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Admins can insert cable tv plans"
ON public.cable_tv_plans
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Admins can update cable tv plans"
ON public.cable_tv_plans
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Admins can delete cable tv plans"
ON public.cable_tv_plans
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
