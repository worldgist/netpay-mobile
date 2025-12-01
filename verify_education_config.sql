-- Verify and fix education services configuration
-- Run this in Supabase SQL Editor

-- 1. Ensure education_provider setting exists in app_settings
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'education_provider',
  '{"provider": "vtpass"}'::jsonb,
  'system',
  'Education vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone'
)
ON CONFLICT (setting_key) DO UPDATE
SET 
  setting_value = EXCLUDED.setting_value,
  updated_at = now();

-- 2. Verify education_services table has all required columns
DO $$
BEGIN
  -- Check and add vending_provider if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'education_services' 
      AND column_name = 'vending_provider'
  ) THEN
    ALTER TABLE public.education_services ADD COLUMN vending_provider TEXT;
    RAISE NOTICE 'Added vending_provider column';
  END IF;

  -- Check and add vtpass_code if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'education_services' 
      AND column_name = 'vtpass_code'
  ) THEN
    ALTER TABLE public.education_services ADD COLUMN vtpass_code TEXT;
    RAISE NOTICE 'Added vtpass_code column';
  END IF;

  -- Check and add smeplug_code if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'education_services' 
      AND column_name = 'smeplug_code'
  ) THEN
    ALTER TABLE public.education_services ADD COLUMN smeplug_code TEXT;
    RAISE NOTICE 'Added smeplug_code column';
  END IF;

  -- Check and add mobilenig_code if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'education_services' 
      AND column_name = 'mobilenig_code'
  ) THEN
    ALTER TABLE public.education_services ADD COLUMN mobilenig_code TEXT;
    RAISE NOTICE 'Added mobilenig_code column';
  END IF;

  -- Check and add vendor_price if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'education_services' 
      AND column_name = 'vendor_price'
  ) THEN
    ALTER TABLE public.education_services ADD COLUMN vendor_price NUMERIC(10,2);
    RAISE NOTICE 'Added vendor_price column';
  END IF;

  -- Check and add user_price if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'education_services' 
      AND column_name = 'user_price'
  ) THEN
    ALTER TABLE public.education_services ADD COLUMN user_price NUMERIC(10,2);
    RAISE NOTICE 'Added user_price column';
  END IF;

END $$;

-- 3. Set default vending_provider for existing records if null
UPDATE public.education_services 
SET vending_provider = 'mobilenig' 
WHERE vending_provider IS NULL;

-- 4. Show current configuration status
SELECT 
  'Table Columns' AS check_type,
  COUNT(*) AS count,
  STRING_AGG(column_name, ', ' ORDER BY column_name) AS details
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'education_services'
  AND column_name IN ('vending_provider', 'vtpass_code', 'smeplug_code', 'mobilenig_code', 'vendor_price', 'user_price');

-- 5. Show app_settings configuration
SELECT 
  'App Settings' AS check_type,
  setting_key,
  setting_value,
  setting_category
FROM public.app_settings
WHERE setting_key = 'education_provider';

-- 6. Show sample education services with their configuration
SELECT 
  'Sample Services' AS check_type,
  exam_type,
  service_name,
  service_id,
  vending_provider,
  vtpass_code,
  COUNT(*) AS count
FROM public.education_services
GROUP BY exam_type, service_name, service_id, vending_provider, vtpass_code
ORDER BY exam_type, service_name
LIMIT 10;





