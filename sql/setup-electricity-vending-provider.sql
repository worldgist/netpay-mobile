-- Add electricity_provider setting to app_settings table
-- This tracks which vending service (smeplug, vtpass, etc.) is used to vend electricity

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'electricity_provider',
  '{"provider": "smeplug"}'::jsonb,
  'system',
  'Electricity vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Verify the setting was added
SELECT setting_key, setting_value
FROM public.app_settings
WHERE setting_key = 'electricity_provider';

