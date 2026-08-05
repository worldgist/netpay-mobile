-- Set eBills Africa as the active vending provider for airtime, data, cable TV, and electricity.
-- Run in Supabase SQL Editor or via: npx supabase db execute --file sql/apply-ebills-vending-providers.sql

UPDATE public.app_settings
SET
  setting_value = '{"provider": "ebills"}'::jsonb,
  description = 'Airtime vending provider: smeplug or ebills (eBills Africa)',
  updated_at = now()
WHERE setting_key = 'airtime_provider';

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
SELECT 'airtime_provider', '{"provider": "ebills"}'::jsonb, 'system', 'Airtime vending provider: smeplug or ebills (eBills Africa)'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'airtime_provider');

UPDATE public.app_settings
SET
  setting_value = '{"provider": "ebills"}'::jsonb,
  description = 'Data vending provider: smeplug, vtpass, mobilenig, anyone, or ebills (eBills Africa)',
  updated_at = now()
WHERE setting_key = 'data_provider';

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
SELECT 'data_provider', '{"provider": "ebills"}'::jsonb, 'system', 'Data vending provider: smeplug, vtpass, mobilenig, anyone, or ebills (eBills Africa)'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'data_provider');

UPDATE public.app_settings
SET
  setting_value = '{"provider": "ebills"}'::jsonb,
  description = 'Cable TV vending provider: vtpass, ebills, mobilenig, or anyone',
  updated_at = now()
WHERE setting_key = 'cable_provider';

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
SELECT 'cable_provider', '{"provider": "ebills"}'::jsonb, 'system', 'Cable TV vending provider: vtpass, ebills, mobilenig, or anyone'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'cable_provider');

UPDATE public.app_settings
SET
  setting_value = '{"provider": "ebills"}'::jsonb,
  description = 'Electricity vending provider: vtpass, mobilenig, or ebills (eBills Africa)',
  updated_at = now()
WHERE setting_key = 'electricity_provider';

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
SELECT 'electricity_provider', '{"provider": "ebills"}'::jsonb, 'system', 'Electricity vending provider: vtpass, mobilenig, or ebills (eBills Africa)'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE setting_key = 'electricity_provider');

-- Normalize legacy ebills.africa values
UPDATE public.app_settings
SET setting_value = '{"provider": "ebills"}'::jsonb, updated_at = now()
WHERE setting_key IN ('airtime_provider', 'data_provider', 'cable_provider', 'electricity_provider')
  AND (
    setting_value::text ILIKE '%ebills.africa%'
    OR setting_value::text = '"ebills.africa"'
  );

SELECT setting_key, setting_value, description, updated_at
FROM public.app_settings
WHERE setting_key IN ('airtime_provider', 'data_provider', 'cable_provider', 'electricity_provider')
ORDER BY setting_key;
