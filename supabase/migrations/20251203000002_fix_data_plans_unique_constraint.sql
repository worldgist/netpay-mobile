-- Fix data_plans unique constraint to ensure it exists
-- This ensures the (provider, api_code) unique constraint exists for upsert operations

-- Drop the constraint if it exists with a different name
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'data_plans_provider_api_code_key'
  ) THEN
    ALTER TABLE public.data_plans
    DROP CONSTRAINT data_plans_provider_api_code_key;
  END IF;
  
  -- Also drop the old api_code only constraint if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'data_plans_api_code_key'
  ) THEN
    ALTER TABLE public.data_plans
    DROP CONSTRAINT data_plans_api_code_key;
  END IF;
END $$;

-- Ensure provider column exists
ALTER TABLE public.data_plans
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'smeplug';

-- Update existing records to have provider if null
UPDATE public.data_plans
SET provider = 'smeplug'
WHERE provider IS NULL;

-- Create the unique constraint on (provider, api_code)
-- This allows same api_code for different providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'data_plans_provider_api_code_key'
  ) THEN
    ALTER TABLE public.data_plans
    ADD CONSTRAINT data_plans_provider_api_code_key
    UNIQUE (provider, api_code);
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_data_plans_provider ON public.data_plans(provider);
CREATE INDEX IF NOT EXISTS idx_data_plans_provider_api_code ON public.data_plans(provider, api_code);

