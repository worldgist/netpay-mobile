-- Fix the get_cable_plan_effective_price function to set search_path
CREATE OR REPLACE FUNCTION public.get_cable_plan_effective_price(plan_id UUID)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(custom_price, original_price, price)
  FROM public.cable_tv_plans
  WHERE id = plan_id;
$$;