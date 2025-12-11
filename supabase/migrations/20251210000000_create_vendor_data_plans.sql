-- Update data_plans table to add vendor codes (if not already present)
-- This migration adds vendor code columns to the existing data_plans table

-- Check if data_plans table exists, if not create it
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'data_plans'
  ) THEN
    -- Create the table if it doesn't exist
    CREATE TABLE public.data_plans (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      network TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      validity TEXT NOT NULL,
      api_code TEXT NOT NULL,
      provider TEXT DEFAULT 'smeplug',
      original_price NUMERIC(10,2),
      custom_price NUMERIC(10,2),
      user_price NUMERIC(10,2),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
    
    -- Enable RLS
    ALTER TABLE public.data_plans ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Add vendor code columns if they don't exist
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS mobilenig_code TEXT;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS vtpass_code TEXT;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS smeplug_code TEXT;

-- Ensure api_code exists (should already exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'data_plans' 
    AND column_name = 'api_code'
  ) THEN
    ALTER TABLE public.data_plans ADD COLUMN api_code TEXT;
  END IF;
END $$;

-- Create indexes for vendor codes if they don't exist
CREATE INDEX IF NOT EXISTS idx_data_plans_mobilenig_code ON public.data_plans(mobilenig_code) WHERE mobilenig_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_plans_vtpass_code ON public.data_plans(vtpass_code) WHERE vtpass_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_plans_smeplug_code ON public.data_plans(smeplug_code) WHERE smeplug_code IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.data_plans.mobilenig_code IS 'MobileNig product code for this plan';
COMMENT ON COLUMN public.data_plans.vtpass_code IS 'VTpass variation code for this plan';
COMMENT ON COLUMN public.data_plans.smeplug_code IS 'SMEPlug plan ID for this plan';

