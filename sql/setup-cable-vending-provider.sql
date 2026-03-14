-- Add vending_provider column to cable_tv_plans table
-- This tracks which vending service (smeplug, vtpass, etc.) is used to vend cable TV subscriptions

-- Step 1: Add the vending_provider column (nullable initially)
ALTER TABLE public.cable_tv_plans
ADD COLUMN IF NOT EXISTS vending_provider TEXT;

-- Step 2: Set default value for existing rows (assuming they were smeplug)
UPDATE public.cable_tv_plans
SET vending_provider = 'smeplug'
WHERE vending_provider IS NULL;

-- Step 3: Make vending_provider NOT NULL with default value
ALTER TABLE public.cable_tv_plans
ALTER COLUMN vending_provider SET NOT NULL,
ALTER COLUMN vending_provider SET DEFAULT 'smeplug';

-- Step 4: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_cable_tv_plans_vending_provider 
ON public.cable_tv_plans(vending_provider);

CREATE INDEX IF NOT EXISTS idx_cable_tv_plans_provider_vending 
ON public.cable_tv_plans(provider, vending_provider);

-- Step 5: Add cable_provider setting to app_settings table
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'cable_provider',
  '{"provider": "smeplug"}'::jsonb,
  'system',
  'Cable TV vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'cable_tv_plans'
AND column_name = 'vending_provider';

-- Verify the setting was added
SELECT setting_key, setting_value
FROM public.app_settings
WHERE setting_key = 'cable_provider';

