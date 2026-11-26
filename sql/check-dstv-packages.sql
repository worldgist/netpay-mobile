-- Check DSTV packages in database
SELECT 
  vending_provider,
  COUNT(*) as package_count,
  COUNT(DISTINCT api_code) as unique_api_codes,
  COUNT(DISTINCT LOWER(TRIM(package_name))) as unique_package_names
FROM cable_tv_plans
WHERE provider = 'DSTV' AND is_active = true
GROUP BY vending_provider
ORDER BY vending_provider;

-- Show duplicate package names across different vending providers
SELECT 
  LOWER(TRIM(package_name)) as normalized_name,
  COUNT(*) as count,
  array_agg(DISTINCT vending_provider) as vending_providers,
  array_agg(DISTINCT api_code) as api_codes
FROM cable_tv_plans
WHERE provider = 'DSTV' AND is_active = true
GROUP BY LOWER(TRIM(package_name))
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 20;
