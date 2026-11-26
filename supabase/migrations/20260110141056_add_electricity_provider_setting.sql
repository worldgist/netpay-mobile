-- Add electricity_provider setting to app_settings table
-- This stores the currently selected vending provider for electricity purchases
-- Supported providers: mobilenig, ebills

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'electricity_provider',
  '{"provider": "ebills"}'::jsonb,
  'system',
  'Electricity vending provider: mobilenig or ebills'
)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = COALESCE(
    -- Keep existing value if it's valid
    CASE 
      WHEN (app_settings.setting_value->>'provider') IN ('mobilenig', 'ebills', 'ebill', 'ebills.africa') 
      THEN app_settings.setting_value
      ELSE '{"provider": "ebills"}'::jsonb
    END,
    '{"provider": "ebills"}'::jsonb
  ),
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


