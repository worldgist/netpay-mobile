-- Check electricity_provider setting in app_settings
SELECT 
  setting_key,
  setting_value,
  setting_value->>'provider' as provider_value,
  jsonb_typeof(setting_value) as value_type,
  setting_category,
  description
FROM app_settings
WHERE setting_key = 'electricity_provider';

-- If setting doesn't exist, show how to create it
-- INSERT INTO app_settings (setting_key, setting_value, setting_category, description)
-- VALUES (
--   'electricity_provider',
--   '{"provider": "ebills"}'::jsonb,
--   'system',
--   'Electricity vending provider: mobilenig or ebills'
-- )
-- ON CONFLICT (setting_key) 
-- DO UPDATE SET 
--   setting_value = '{"provider": "ebills"}'::jsonb,
--   updated_at = now();


