-- Check and fix platform values in user_push_tokens table
-- This script helps identify and fix Android devices that might have null or empty platform values

-- First, let's see what platform values we have
SELECT 
  platform,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE is_active = true) as active_count
FROM user_push_tokens
GROUP BY platform
ORDER BY count DESC;

-- Check for tokens with null or empty platform
SELECT 
  COUNT(*) as total_with_null_or_empty_platform,
  COUNT(*) FILTER (WHERE is_active = true) as active_with_null_or_empty
FROM user_push_tokens
WHERE platform IS NULL OR platform = '';

-- If you have Android devices with null/empty platform, you can try to identify them
-- by checking token patterns or other methods, but the safest approach is to have
-- users re-register their push tokens from the mobile app

-- For now, let's see all active tokens and their platforms
SELECT 
  id,
  platform,
  is_active,
  created_at,
  LEFT(expo_push_token, 20) as token_preview
FROM user_push_tokens
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 20;


