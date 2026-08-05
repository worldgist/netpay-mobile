-- Force airtime vending provider to SMEPLUG only
UPDATE public.app_settings
SET
  setting_value = '{"provider": "smeplug"}'::jsonb,
  description = 'Airtime vending provider: SMEPLUG only (uses SMEPLUG_SECRET_KEY)'
WHERE setting_key = 'airtime_provider';

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
SELECT
  'airtime_provider',
  '{"provider": "smeplug"}'::jsonb,
  'system',
  'Airtime vending provider: SMEPLUG only (uses SMEPLUG_SECRET_KEY)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'airtime_provider'
);
