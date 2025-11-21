-- Add columns for original and custom pricing to data_plans
ALTER TABLE public.data_plans 
  ADD COLUMN IF NOT EXISTS original_price NUMERIC,
  ADD COLUMN IF NOT EXISTS custom_price NUMERIC;

-- Update existing data: move current price to original_price
UPDATE public.data_plans 
SET original_price = price 
WHERE original_price IS NULL;

-- Create a function to get the effective price (custom price if set, otherwise original)
CREATE OR REPLACE FUNCTION public.get_data_plan_effective_price(plan_id UUID)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(custom_price, original_price, price)
  FROM public.data_plans
  WHERE id = plan_id;
$$;

-- Create a function to reset custom prices (set to NULL)
CREATE OR REPLACE FUNCTION public.reset_data_plan_custom_prices(plan_ids UUID[])
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.data_plans
  SET custom_price = NULL,
      updated_at = now()
  WHERE id = ANY(plan_ids);
$$;

-- Create a function to reset all custom prices for a provider
CREATE OR REPLACE FUNCTION public.reset_data_provider_custom_prices(provider_name TEXT)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.data_plans
  SET custom_price = NULL,
      updated_at = now()
  WHERE provider = provider_name;
$$;

-- Add comments to document the pricing structure
COMMENT ON COLUMN public.data_plans.original_price IS 'Original price from API';
COMMENT ON COLUMN public.data_plans.custom_price IS 'Admin-set custom price (overrides original_price when set)';
COMMENT ON COLUMN public.data_plans.price IS 'Legacy price column (kept for backward compatibility)';

