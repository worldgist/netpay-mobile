-- Add education_provider setting to app_settings table
-- This stores the currently selected vending provider for education services management

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'education_provider',
  '{"provider": "mobilenig"}'::jsonb,
  'system',
  'Education vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Verify the setting was added
SELECT setting_key, setting_value
FROM public.app_settings
WHERE setting_key = 'education_provider';

