-- Fix data_plans unique constraint and ensure RLS policies are correct
-- This migration ensures the (provider, api_code) unique constraint exists
-- and that RLS policies allow admins to insert/update data plans

-- Step 1: Ensure provider column exists
ALTER TABLE public.data_plans
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'smeplug';

-- Update existing records to have provider if null
UPDATE public.data_plans
SET provider = 'smeplug'
WHERE provider IS NULL;

-- Make provider NOT NULL after setting defaults
DO $$
BEGIN
  -- Check if provider column is nullable
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'data_plans'
      AND column_name = 'provider'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.data_plans
      ALTER COLUMN provider SET NOT NULL;
  END IF;
END $$;

-- Step 2: Drop old unique constraint on api_code if it exists
ALTER TABLE public.data_plans
  DROP CONSTRAINT IF EXISTS data_plans_api_code_key;

-- Step 3: Ensure the unique constraint on (provider, api_code) exists
DO $$
BEGIN
  -- Drop the constraint if it exists (to recreate it cleanly)
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'data_plans_provider_api_code_key'
  ) THEN
    ALTER TABLE public.data_plans
      DROP CONSTRAINT data_plans_provider_api_code_key;
  END IF;
  
  -- Create the unique constraint
  ALTER TABLE public.data_plans
    ADD CONSTRAINT data_plans_provider_api_code_key
    UNIQUE (provider, api_code);
END $$;

-- Step 4: Ensure RLS is enabled
ALTER TABLE public.data_plans ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop and recreate RLS policies to ensure they're correct
DROP POLICY IF EXISTS "Admins can view all data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Admins can insert data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Admins can update data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Admins can delete data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Users can view active data plans" ON public.data_plans;

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

-- Step 6: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_data_plans_provider ON public.data_plans(provider);
CREATE INDEX IF NOT EXISTS idx_data_plans_provider_api_code ON public.data_plans(provider, api_code);

