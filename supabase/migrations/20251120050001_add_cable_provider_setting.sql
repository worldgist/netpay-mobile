-- Add cable_provider setting to app_settings table
-- This stores the currently selected vending provider for cable TV management

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'cable_provider',
  '{"provider": "smeplug"}'::jsonb,
  'system',
  'Cable TV vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone'
)
ON CONFLICT (setting_key) DO NOTHING;

