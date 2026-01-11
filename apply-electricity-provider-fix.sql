-- Apply electricity_provider setting fix
-- This ensures the setting exists and is properly formatted

-- Insert or update the electricity_provider setting
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'electricity_provider',
  '{"provider": "ebills"}'::jsonb,
  'system',
  'Electricity vending provider: mobilenig or ebills'
)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = '{"provider": "ebills"}'::jsonb,
  description = 'Electricity vending provider: mobilenig or ebills',
  updated_at = now();

-- Normalize any existing values (ebill -> ebills, ebills.africa -> ebills)
UPDATE public.app_settings
SET setting_value = CASE
  WHEN setting_value->>'provider' = 'ebill' THEN '{"provider": "ebills"}'::jsonb
  WHEN setting_value->>'provider' = 'ebills.africa' THEN '{"provider": "ebills"}'::jsonb
  ELSE setting_value
END
WHERE setting_key = 'electricity_provider'
  AND setting_value->>'provider' IN ('ebill', 'ebills.africa');

-- Verify the setting
SELECT 
  setting_key,
  setting_value,
  setting_value->>'provider' as provider_value,
  updated_at
FROM app_settings
WHERE setting_key = 'electricity_provider';


