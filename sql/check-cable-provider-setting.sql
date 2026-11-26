-- Check cable provider setting in app_settings
SELECT 
  setting_key,
  setting_value,
  setting_category,
  description,
  created_at,
  updated_at
FROM app_settings
WHERE setting_key = 'cable_provider';

-- Check if RLS policies allow admin to update
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'app_settings';
