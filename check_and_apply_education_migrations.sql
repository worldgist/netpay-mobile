-- Step 1: Check current table structure
-- This will show you what columns currently exist
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'education_services' 
ORDER BY ordinal_position;

-- Step 2: Check existing constraints
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.education_services'::regclass
ORDER BY conname;

-- ============================================
-- Step 3: Apply migrations (run after checking above)
-- ============================================

-- Add vending_provider column to track which vendor provides each service
ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS vending_provider TEXT;

-- Set default value for existing records
UPDATE public.education_services 
SET vending_provider = 'mobilenig' 
WHERE vending_provider IS NULL;

-- Add vendor code columns for each vendor
ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS vtpass_code TEXT;

ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS smeplug_code TEXT;

ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS mobilenig_code TEXT;

-- Add vendor_price and user_price columns
ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS vendor_price NUMERIC(10,2);

ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS user_price NUMERIC(10,2);

-- Ensure service_id column exists
ALTER TABLE public.education_services
  ADD COLUMN IF NOT EXISTS service_id TEXT;

-- Populate service_id if it's null
UPDATE public.education_services
SET service_id = CASE
  WHEN upper(exam_type) = 'WAEC' THEN 'AJA'
  WHEN upper(exam_type) = 'NECO' THEN 'AJC'
  WHEN upper(exam_type) = 'JAMB' THEN 'AJB'
  ELSE service_id
END
WHERE service_id IS NULL;

-- Fallback to existing API code if still missing
UPDATE public.education_services
SET service_id = api_code
WHERE service_id IS NULL
  AND api_code IS NOT NULL;

-- Final fallback to row id text
UPDATE public.education_services
SET service_id = id::text
WHERE service_id IS NULL;

-- Migrate existing data to new structure
-- Set vendor_price from original_price or price
UPDATE public.education_services 
SET vendor_price = COALESCE(original_price, price)
WHERE vendor_price IS NULL;

-- Set user_price from custom_price, original_price, or price
UPDATE public.education_services 
SET user_price = COALESCE(custom_price, original_price, price)
WHERE user_price IS NULL;

-- Migrate existing api_code to appropriate vendor code based on vending_provider
UPDATE public.education_services 
SET 
  mobilenig_code = CASE WHEN vending_provider = 'mobilenig' THEN api_code ELSE mobilenig_code END,
  smeplug_code = CASE WHEN vending_provider = 'smeplug' THEN api_code ELSE smeplug_code END,
  vtpass_code = CASE WHEN vending_provider = 'vtpass' THEN api_code ELSE vtpass_code END
WHERE (mobilenig_code IS NULL AND smeplug_code IS NULL AND vtpass_code IS NULL);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_education_services_vending_provider 
  ON public.education_services(vending_provider);

CREATE INDEX IF NOT EXISTS idx_education_services_exam_type_vending_provider 
  ON public.education_services(exam_type, vending_provider);

CREATE INDEX IF NOT EXISTS idx_education_services_is_active 
  ON public.education_services(is_active);

-- Add comments for documentation
COMMENT ON COLUMN public.education_services.vending_provider IS 'Vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone';
COMMENT ON COLUMN public.education_services.vtpass_code IS 'VTpass service code/variation code';
COMMENT ON COLUMN public.education_services.smeplug_code IS 'SMEPlug service code';
COMMENT ON COLUMN public.education_services.mobilenig_code IS 'Mobilenig service code';
COMMENT ON COLUMN public.education_services.vendor_price IS 'Price charged by vendor (cost price)';
COMMENT ON COLUMN public.education_services.user_price IS 'Price charged to user (selling price)';

-- Update the unique constraint to include vending_provider
DO $$
BEGIN
  -- Drop the existing unique constraint if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'education_services_exam_type_service_id_key'
  ) THEN
    ALTER TABLE public.education_services
    DROP CONSTRAINT education_services_exam_type_service_id_key;
  END IF;
  
  -- Also drop the old api_code constraint if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'education_services_exam_type_api_code_key'
  ) THEN
    ALTER TABLE public.education_services
    DROP CONSTRAINT education_services_exam_type_api_code_key;
  END IF;
  
  -- Add new unique constraint that includes vending_provider
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'education_services_exam_type_service_id_vending_provider_key'
  ) THEN
    -- Check if service_id column exists before creating constraint
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'education_services'
      AND column_name = 'service_id'
    ) THEN
      ALTER TABLE public.education_services
      ADD CONSTRAINT education_services_exam_type_service_id_vending_provider_key
      UNIQUE (exam_type, service_id, vending_provider);
    ELSE
      -- Fallback: use api_code if service_id doesn't exist
      ALTER TABLE public.education_services
      ADD CONSTRAINT education_services_exam_type_api_code_vending_provider_key
      UNIQUE (exam_type, api_code, vending_provider);
    END IF;
  END IF;
END $$;

-- Add education_provider setting to app_settings
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'education_provider',
  '{"provider": "mobilenig"}'::jsonb,
  'system',
  'Education vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Verify the final table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'education_services' 
ORDER BY ordinal_position;

-- Verify the setting was added
SELECT setting_key, setting_value
FROM public.app_settings
WHERE setting_key = 'education_provider';

