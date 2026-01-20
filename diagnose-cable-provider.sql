-- Check cable provider setting
SELECT 
  setting_key,
  setting_value->>'provider' as current_provider,
  setting_value,
  updated_at
FROM app_settings
WHERE setting_key = 'cable_provider';

-- Check cable plans by vending provider for DSTV
SELECT 
  vending_provider,
  COUNT(*) as plan_count,
  MIN(price) as min_price,
  MAX(price) as max_price
FROM cable_tv_plans
WHERE provider = 'DSTV' AND is_active = true
GROUP BY vending_provider;

-- Sample DSTV plans from each provider
SELECT 
  vending_provider,
  package_name,
  price,
  api_code
FROM cable_tv_plans
WHERE provider = 'DSTV' AND is_active = true
ORDER BY vending_provider, price
LIMIT 20;
