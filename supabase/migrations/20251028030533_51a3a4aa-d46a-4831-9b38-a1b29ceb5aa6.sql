-- Add custom pricing and active status columns to electricity_plans
ALTER TABLE public.electricity_plans 
ADD COLUMN IF NOT EXISTS original_price NUMERIC,
ADD COLUMN IF NOT EXISTS custom_price NUMERIC,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Create function to get effective price for electricity plans
CREATE OR REPLACE FUNCTION public.get_electricity_plan_effective_price(plan_id uuid)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(custom_price, original_price, price)
  FROM public.electricity_plans
  WHERE id = plan_id;
$$;

-- Create function to reset custom prices for electricity plans
CREATE OR REPLACE FUNCTION public.reset_electricity_plan_custom_prices(plan_ids uuid[])
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.electricity_plans
  SET custom_price = NULL,
      updated_at = now()
  WHERE id = ANY(plan_ids);
$$;

-- Create function to reset all custom prices for a provider
CREATE OR REPLACE FUNCTION public.reset_electricity_provider_custom_prices(provider_name text)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.electricity_plans
  SET custom_price = NULL,
      updated_at = now()
  WHERE provider = provider_name;
$$;