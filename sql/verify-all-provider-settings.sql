-- Verify all vending provider settings in app_settings
-- Run this to check that all provider settings are correctly configured

-- 1. Check all provider settings exist
SELECT 
  setting_key,
  setting_value->>'provider' as active_provider,
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

-- 2. Summary view
SELECT 
  CASE setting_key
    WHEN 'airtime_provider' THEN 'Airtime'
    WHEN 'data_provider' THEN 'Data'
    WHEN 'cable_provider' THEN 'Cable TV'
    WHEN 'electricity_provider' THEN 'Electricity'
    WHEN 'education_provider' THEN 'Education'
    WHEN 'betting_provider' THEN 'Betting'
  END as service,
  setting_value->>'provider' as active_provider,
  CASE setting_value->>'provider'
    WHEN 'vtpass' THEN 'VTpass'
    WHEN 'mobilenig' THEN 'MobileNig'
    WHEN 'smeplug' THEN 'SMEPLUG'
    WHEN 'ebills' THEN 'eBills Africa'
    WHEN 'anyone' THEN 'ANYONE'
    ELSE setting_value->>'provider'
  END as provider_name
FROM app_settings
WHERE setting_key LIKE '%_provider'
ORDER BY setting_key;

-- 3. Check for missing provider settings
SELECT 
  provider_key,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM app_settings 
      WHERE setting_key = provider_key
    ) THEN 'EXISTS' 
    ELSE 'MISSING' 
  END as status
FROM (
  VALUES 
    ('airtime_provider'),
    ('data_provider'),
    ('cable_provider'),
    ('electricity_provider'),
    ('education_provider'),
    ('betting_provider')
) AS providers(provider_key);
