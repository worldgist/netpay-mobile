-- Check all WAEC services in the database
SELECT 
  id,
  exam_type,
  service_name,
  price,
  custom_price,
  original_price,
  api_code,
  service_id,
  vtpass_code,
  vending_provider,
  is_active,
  created_at
FROM education_services
WHERE exam_type ILIKE '%WAEC%' OR service_name ILIKE '%WAEC%'
ORDER BY price ASC, created_at ASC;
