-- Force betting vending provider to eBills Africa only
UPDATE public.app_settings
SET
  setting_value = '{"provider": "ebills"}'::jsonb,
  description = 'Betting vending provider: eBills Africa only'
WHERE setting_key = 'betting_provider';

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
SELECT
  'betting_provider',
  '{"provider": "ebills"}'::jsonb,
  'system',
  'Betting vending provider: eBills Africa only'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings WHERE setting_key = 'betting_provider'
);
