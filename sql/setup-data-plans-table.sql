-- ============================================================================
-- Complete Data Plans Table Setup
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/xrpuvnhmdmpgelfxpdcx/sql
-- ============================================================================

-- Step 1: Create the data_plans table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.data_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  validity TEXT NOT NULL,
  api_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Step 2: Add provider column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'data_plans' 
    AND column_name = 'provider'
  ) THEN
    ALTER TABLE public.data_plans 
      ADD COLUMN provider TEXT DEFAULT 'smeplug';
    
    -- Update existing records to have provider
    UPDATE public.data_plans 
    SET provider = 'smeplug' 
    WHERE provider IS NULL;
    
    -- Make provider NOT NULL after setting defaults
    ALTER TABLE public.data_plans 
      ALTER COLUMN provider SET NOT NULL;
    
    -- Set default for future inserts
    ALTER TABLE public.data_plans 
      ALTER COLUMN provider SET DEFAULT 'smeplug';
  END IF;
END $$;

-- Step 3: Drop old unique constraint on api_code if it exists
ALTER TABLE public.data_plans 
  DROP CONSTRAINT IF EXISTS data_plans_api_code_key;

-- Step 4: Add new unique constraint on (provider, api_code)
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

-- Step 5: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_data_plans_provider ON public.data_plans(provider);
CREATE INDEX IF NOT EXISTS idx_data_plans_network ON public.data_plans(network);
CREATE INDEX IF NOT EXISTS idx_data_plans_provider_network ON public.data_plans(provider, network);
CREATE INDEX IF NOT EXISTS idx_data_plans_api_code ON public.data_plans(api_code);

-- Step 6: Create or replace the update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Step 7: Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_data_plans_updated_at ON public.data_plans;
CREATE TRIGGER update_data_plans_updated_at
  BEFORE UPDATE ON public.data_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 8: Enable Row Level Security
ALTER TABLE public.data_plans ENABLE ROW LEVEL SECURITY;

-- Step 9: Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Admins can view all data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Admins can insert data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Admins can update data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Admins can delete data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Users can view active data plans" ON public.data_plans;

-- Step 10: Create RLS Policies
-- Policy: Admins can view all data plans
CREATE POLICY "Admins can view all data plans"
ON public.data_plans
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can insert data plans
CREATE POLICY "Admins can insert data plans"
ON public.data_plans
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can update data plans
CREATE POLICY "Admins can update data plans"
ON public.data_plans
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can delete data plans
CREATE POLICY "Admins can delete data plans"
ON public.data_plans
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Users can view active data plans (for mobile app)
CREATE POLICY "Users can view active data plans"
ON public.data_plans
FOR SELECT
TO authenticated
USING (true);

-- Step 11: Add comments for documentation
COMMENT ON TABLE public.data_plans IS 'Data plans for mobile data purchases from various providers';
COMMENT ON COLUMN public.data_plans.id IS 'Unique identifier for the data plan';
COMMENT ON COLUMN public.data_plans.network IS 'Network provider (MTN, Airtel, Glo, 9mobile)';
COMMENT ON COLUMN public.data_plans.plan_name IS 'Name of the data plan';
COMMENT ON COLUMN public.data_plans.price IS 'Price of the data plan in Naira';
COMMENT ON COLUMN public.data_plans.validity IS 'Validity period of the data plan';
COMMENT ON COLUMN public.data_plans.api_code IS 'API code used by the provider to identify this plan';
COMMENT ON COLUMN public.data_plans.provider IS 'Data provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone';
COMMENT ON COLUMN public.data_plans.created_at IS 'Timestamp when the plan was created';
COMMENT ON COLUMN public.data_plans.updated_at IS 'Timestamp when the plan was last updated';

-- Step 12: Verify the setup
DO $$
DECLARE
  table_exists BOOLEAN;
  provider_column_exists BOOLEAN;
  constraint_exists BOOLEAN;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'data_plans'
  ) INTO table_exists;
  
  -- Check if provider column exists
  SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'data_plans' 
    AND column_name = 'provider'
  ) INTO provider_column_exists;
  
  -- Check if unique constraint exists
  SELECT EXISTS (
    SELECT FROM pg_constraint 
    WHERE conname = 'data_plans_provider_api_code_key'
  ) INTO constraint_exists;
  
  -- Output results
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Data Plans Table Setup Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Table exists: %', table_exists;
  RAISE NOTICE 'Provider column exists: %', provider_column_exists;
  RAISE NOTICE 'Unique constraint exists: %', constraint_exists;
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- Setup Complete!
-- ============================================================================
-- The data_plans table is now ready with:
-- ✅ All required columns (including provider)
-- ✅ Unique constraint on (provider, api_code)
-- ✅ Indexes for performance
-- ✅ RLS policies for admin access
-- ✅ Auto-update trigger for updated_at
-- ✅ User access policy for mobile app
-- ============================================================================

