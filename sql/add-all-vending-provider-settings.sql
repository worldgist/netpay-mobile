-- Add all vending provider settings to app_settings table
-- Run this in your Supabase SQL Editor
-- This script adds default vending provider configurations for all services

-- 1. AIRTIME PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'airtime_provider',
  '{"provider": "vtpass"}'::jsonb,
  'system',
  'Airtime vending provider: vtpass, mobilenig, smeplug, or ebills'
)
ON CONFLICT (setting_key) 
DO UPDATE SET
  description = 'Airtime vending provider: vtpass, mobilenig, smeplug, or ebills',
  updated_at = now()
WHERE app_settings.setting_key = 'airtime_provider';

-- 2. DATA PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'data_provider',
  '{"provider": "smeplug"}'::jsonb,
  'system',
  'Data vending provider: smeplug, vtpass, mobilenig, or ebills'
)
ON CONFLICT (setting_key) 
DO UPDATE SET
  description = 'Data vending provider: smeplug, vtpass, mobilenig, or ebills',
  updated_at = now()
WHERE app_settings.setting_key = 'data_provider';

-- 3. CABLE TV PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'cable_provider',
  '{"provider": "ebills"}'::jsonb,
  'system',
  'Cable TV vending provider: vtpass, ebills, mobilenig, or anyone'
)
ON CONFLICT (setting_key) 
DO UPDATE SET
  description = 'Cable TV vending provider: vtpass, ebills, mobilenig, or anyone',
  updated_at = now()
WHERE app_settings.setting_key = 'cable_provider';

-- 4. ELECTRICITY PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'electricity_provider',
  '{"provider": "ebills"}'::jsonb,
  'system',
  'Electricity vending provider: mobilenig, ebills, vtpass, or smeplug'
)
ON CONFLICT (setting_key) 
DO UPDATE SET
  description = 'Electricity vending provider: mobilenig, ebills, vtpass, or smeplug',
  updated_at = now()
WHERE app_settings.setting_key = 'electricity_provider';

-- 5. EDUCATION PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'education_provider',
  '{"provider": "vtpass"}'::jsonb,
  'system',
  'Education services provider: vtpass or ebills'
)
ON CONFLICT (setting_key) 
DO UPDATE SET
  description = 'Education services provider: vtpass or ebills',
  updated_at = now()
WHERE app_settings.setting_key = 'education_provider';

-- 6. BETTING PROVIDER SETTING
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'betting_provider',
  '{"provider": "ebills"}'::jsonb,
  'system',
  'Betting services provider: vtpass, ebills, or mobilenig'
)
ON CONFLICT (setting_key) 
DO UPDATE SET
  description = 'Betting services provider: vtpass, ebills, or mobilenig',
  updated_at = now()
WHERE app_settings.setting_key = 'betting_provider';

-- Verify all provider settings
SELECT 
  setting_key,
  setting_value,
  setting_category,
  description,
  created_at,
  updated_at
FROM app_settings
WHERE setting_key IN (
  'airtime_provider',
  'data_provider',
  'cable_provider',
  'electricity_provider',
  'education_provider',
  'betting_provider'
)
ORDER BY setting_key;

-- Summary of vending providers
SELECT 
  setting_key as service,
  setting_value->>'provider' as active_provider,
  description
FROM app_settings
WHERE setting_key LIKE '%_provider'
ORDER BY setting_key;
