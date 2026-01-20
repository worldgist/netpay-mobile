-- Add all vending provider settings to app_settings
-- Migration: Add vending provider configurations for all services

-- 1. AIRTIME PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'airtime_provider',
  '{"provider": "vtpass"}'::jsonb,
  'system',
  'Airtime vending provider: vtpass, mobilenig, smeplug, or ebills'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 2. DATA PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'data_provider',
  '{"provider": "smeplug"}'::jsonb,
  'system',
  'Data vending provider: smeplug, vtpass, mobilenig, or ebills'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 3. CABLE TV PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'cable_provider',
  '{"provider": "ebills"}'::jsonb,
  'system',
  'Cable TV vending provider: vtpass, ebills, mobilenig, or anyone'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 4. ELECTRICITY PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'electricity_provider',
  '{"provider": "ebills"}'::jsonb,
  'system',
  'Electricity vending provider: mobilenig, ebills, vtpass, or smeplug'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 5. EDUCATION PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'education_provider',
  '{"provider": "vtpass"}'::jsonb,
  'system',
  'Education services provider: vtpass or ebills'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 6. BETTING PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'betting_provider',
  '{"provider": "ebills"}'::jsonb,
  'system',
  'Betting services provider: vtpass, ebills, or mobilenig'
)
ON CONFLICT (setting_key) DO NOTHING;
