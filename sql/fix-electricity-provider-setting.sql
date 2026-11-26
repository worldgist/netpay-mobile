-- Fix electricity_provider setting
-- This script will check and fix the electricity_provider setting

-- First, check current setting
SELECT 
  setting_key,
  setting_value,
  setting_value->>'provider' as provider_value,
  jsonb_typeof(setting_value) as value_type
FROM app_settings
WHERE setting_key = 'electricity_provider';

-- Fix the setting (run this if needed)
UPDATE app_settings
SET 
  setting_value = '{"provider": "ebills"}'::jsonb,
  updated_at = now()
WHERE setting_key = 'electricity_provider';

-- Verify it's fixed
SELECT 
  setting_key,
  setting_value,
  setting_value->>'provider' as provider_value
FROM app_settings
WHERE setting_key = 'electricity_provider';


