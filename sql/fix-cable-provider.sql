-- Manual SQL to check and fix cable provider setting

-- First, check what's currently stored
SELECT setting_key, setting_value, updated_at 
FROM app_settings 
WHERE setting_key = 'cable_provider';

-- If it shows ebills or smeplug and you want mobilenig, run this:
-- UPDATE app_settings 
-- SET setting_value = '{"provider": "mobilenig"}'::jsonb,
--     updated_at = NOW()
-- WHERE setting_key = 'cable_provider';

-- Then verify:
-- SELECT setting_key, setting_value, updated_at 
-- FROM app_settings 
-- WHERE setting_key = 'cable_provider';
