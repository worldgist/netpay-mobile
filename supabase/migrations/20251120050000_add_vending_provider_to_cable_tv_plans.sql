-- Add vending_provider column to cable_tv_plans table
-- This tracks which vending service (smeplug, vtpass, etc.) is used to vend cable TV subscriptions

ALTER TABLE public.cable_tv_plans
ADD COLUMN IF NOT EXISTS vending_provider TEXT;

-- Set default value for existing rows (assuming they were smeplug)
UPDATE public.cable_tv_plans
SET vending_provider = 'smeplug'
WHERE vending_provider IS NULL;

-- Make vending_provider NOT NULL with default
ALTER TABLE public.cable_tv_plans
ALTER COLUMN vending_provider SET NOT NULL,
ALTER COLUMN vending_provider SET DEFAULT 'smeplug';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_cable_tv_plans_vending_provider 
ON public.cable_tv_plans(vending_provider);

-- Add composite index for provider and vending_provider
CREATE INDEX IF NOT EXISTS idx_cable_tv_plans_provider_vending 
ON public.cable_tv_plans(provider, vending_provider);

