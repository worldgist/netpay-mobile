#!/bin/bash

# Ban suspicious users
# Usage: ./ban_users.sh

echo "Banning suspicious users..."

npx supabase db execute --linked << 'SQL'
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

-- Return banned users info
SELECT 
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
SQL

echo "Users banned successfully!"
