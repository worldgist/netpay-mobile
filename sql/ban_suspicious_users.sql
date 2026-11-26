-- Ban suspicious users
-- Date: 2026-01-17

-- Suspend users by email
UPDATE auth.users
SET banned_until = '2099-12-31 23:59:59'::timestamptz
WHERE email IN (
  'annaleona90@gmail.com',
  'jonnywood158@gmail.com',
  'annaleona00@gmail.com'
);

-- Update profiles to mark as suspended
UPDATE profiles
SET 
  is_suspended = true,
  suspension_reason = 'Suspicious activity - Account banned by admin',
  updated_at = NOW()
WHERE email IN (
  'annaleona90@gmail.com',
  'jonnywood158@gmail.com',
  'annaleona00@gmail.com'
);

-- Log the action
INSERT INTO admin_actions (
  action_type,
  action_description,
  performed_by,
  target_user_id,
  created_at
)
SELECT 
  'ban_user',
  'User banned for suspicious activity: ' || email,
  (SELECT id FROM auth.users WHERE email = 'demo@netppay.com' LIMIT 1),
  id,
  NOW()
FROM profiles
WHERE email IN (
  'annaleona90@gmail.com',
  'jonnywood158@gmail.com',
  'annaleona00@gmail.com'
);

-- Return banned users info
SELECT 
  id,
  email,
  full_name,
  phone_number,
  is_suspended,
  created_at
FROM profiles
WHERE email IN (
  'annaleona90@gmail.com',
  'jonnywood158@gmail.com',
  'annaleona00@gmail.com'
);
