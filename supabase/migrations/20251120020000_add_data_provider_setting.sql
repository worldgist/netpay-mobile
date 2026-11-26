-- Add data provider setting to app_settings
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'data_provider',
  '{"provider": "smeplug"}',
  'system',
  'Data vending provider: smeplug, anyone, vtpass, mobilenig, or ebills.africa'
)
ON CONFLICT (setting_key) DO NOTHING;

