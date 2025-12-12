-- Check education_services table configuration
-- Run this in Supabase SQL Editor to verify the table structure

-- 1. Check if all required columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'education_services'
ORDER BY ordinal_position;

-- 2. Check if education_provider setting exists in app_settings
SELECT 
  setting_key, 
  setting_value,
  setting_category,
  description
FROM public.app_settings
WHERE setting_key = 'education_provider';

-- 3. Check sample education services to see their structure
SELECT 
  id,
  exam_type,
  service_name,
  service_id,
  api_code,
  vtpass_code,
  smeplug_code,
  mobilenig_code,
  vending_provider,
  price,
  vendor_price,
  user_price,
  is_active
FROM public.education_services
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check if indexes exist
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'education_services'
  AND schemaname = 'public';

-- 5. Check for any constraints
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.education_services'::regclass;








