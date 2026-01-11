SELECT 
  setting_key, 
  setting_value, 
  setting_value->>'provider' as provider, 
  jsonb_typeof(setting_value) as value_type, 
  setting_category, 
  description,
  updated_at
FROM app_settings 
WHERE setting_key = 'electricity_provider'
LIMIT 1;

