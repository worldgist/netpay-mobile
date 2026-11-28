-- Plustive Impact plan IDs for data vending
ALTER TABLE public.data_plans
  ADD COLUMN IF NOT EXISTS plustive_code TEXT;

CREATE INDEX IF NOT EXISTS idx_data_plans_plustive_code
  ON public.data_plans(plustive_code)
  WHERE plustive_code IS NOT NULL;

COMMENT ON COLUMN public.data_plans.plustive_code IS 'Plustive Impact planId for this data plan';
