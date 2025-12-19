-- Check all tokens (active and inactive) by platform
SELECT 
  platform,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE is_active = true) as active_count,
  COUNT(*) FILTER (WHERE is_active = false) as inactive_count
FROM user_push_tokens
GROUP BY platform
ORDER BY total_count DESC;

-- Check for tokens with null or empty platform
SELECT 
  COUNT(*) as total_with_null_or_empty,
  COUNT(*) FILTER (WHERE is_active = true) as active_with_null_or_empty,
  COUNT(*) FILTER (WHERE is_active = false) as inactive_with_null_or_empty
FROM user_push_tokens
WHERE platform IS NULL OR platform = '';

-- Show all tokens (including inactive) to see if there are any Android devices
SELECT 
  platform,
  is_active,
  created_at,
  LEFT(expo_push_token, 30) as token_preview
FROM user_push_tokens
ORDER BY created_at DESC
LIMIT 30;


