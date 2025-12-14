-- Diagnose VTpass JAMB configuration issues
-- Run this in Supabase SQL Editor

-- 1. Check if there are any JAMB services in the table
SELECT 
  'JAMB Services in Database' AS check_type,
  COUNT(*) AS count,
  STRING_AGG(CONCAT(exam_type, ' - ', service_name, ' (', vending_provider, ')'), ', ') AS services
FROM public.education_services
WHERE UPPER(exam_type) = 'JAMB';

-- 2. Check education_provider setting
SELECT 
  'Education Provider Setting' AS check_type,
  setting_key,
  setting_value::text AS provider_setting,
  updated_at
FROM public.app_settings
WHERE setting_key = 'education_provider';

-- 3. Check all education services by exam type and provider
SELECT 
  'Services by Type and Provider' AS check_type,
  exam_type,
  vending_provider,
  COUNT(*) AS service_count,
  STRING_AGG(DISTINCT service_id, ', ') AS service_ids,
  STRING_AGG(DISTINCT vtpass_code, ', ') AS vtpass_codes
FROM public.education_services
GROUP BY exam_type, vending_provider
ORDER BY exam_type, vending_provider;

-- 4. Verify table structure has all VTpass columns
SELECT 
  'Table Structure Check' AS check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'education_services'
  AND column_name IN ('vending_provider', 'vtpass_code', 'service_id', 'exam_type')
ORDER BY column_name;













