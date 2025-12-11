-- Ensure the unique constraint on (provider, api_code) exists for data_plans table
-- This constraint is needed for upsert operations

-- Drop the old unique constraint on api_code if it exists (from older migration)
ALTER TABLE public.data_plans 
  DROP CONSTRAINT IF EXISTS data_plans_api_code_key;

-- Add unique constraint on (provider, api_code) if it doesn't exist
-- This allows the same api_code for different providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'data_plans_provider_api_code_key'
  ) THEN
    ALTER TABLE public.data_plans 
      ADD CONSTRAINT data_plans_provider_api_code_key 
      UNIQUE (provider, api_code);
  END IF;
END $$;

-- Verify the constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'data_plans_provider_api_code_key'
  ) THEN
    RAISE EXCEPTION 'Failed to create unique constraint data_plans_provider_api_code_key';
  END IF;
END $$;


