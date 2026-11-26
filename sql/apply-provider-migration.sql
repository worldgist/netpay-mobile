-- Add provider column to data_plans table
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/xrpuvnhmdmpgelfxpdcx/sql

ALTER TABLE public.data_plans 
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'smeplug';

-- Update existing records to have provider
UPDATE public.data_plans 
SET provider = 'smeplug' 
WHERE provider IS NULL;

-- Make provider NOT NULL after setting defaults
ALTER TABLE public.data_plans 
  ALTER COLUMN provider SET NOT NULL;

-- Drop the old unique constraint on api_code
ALTER TABLE public.data_plans 
  DROP CONSTRAINT IF EXISTS data_plans_api_code_key;

-- Add new unique constraint on (provider, api_code) to allow same api_code for different providers
ALTER TABLE public.data_plans 
  ADD CONSTRAINT data_plans_provider_api_code_key UNIQUE (provider, api_code);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_data_plans_provider ON public.data_plans(provider);
CREATE INDEX IF NOT EXISTS idx_data_plans_network ON public.data_plans(network);
CREATE INDEX IF NOT EXISTS idx_data_plans_provider_network ON public.data_plans(provider, network);

-- Add comment to document the provider column
COMMENT ON COLUMN public.data_plans.provider IS 'Data provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone';


