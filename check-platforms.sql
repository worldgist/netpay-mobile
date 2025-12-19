-- Check platform distribution in user_push_tokens
SELECT 
  platform,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE is_active = true) as active_count
FROM user_push_tokens
GROUP BY platform
ORDER BY total_count DESC;

-- Check for null or empty platforms
SELECT 
  COUNT(*) as total_with_null_or_empty_platform,
  COUNT(*) FILTER (WHERE is_active = true) as active_with_null_or_empty
FROM user_push_tokens
WHERE platform IS NULL OR platform = '';

-- Show active tokens with their platforms
SELECT 
  platform,
  is_active,
  created_at,
  LEFT(expo_push_token, 30) as token_preview
FROM user_push_tokens
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 20;


