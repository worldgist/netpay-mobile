-- Check electricity transactions in the database
-- Run this in Supabase SQL Editor

-- 1. Check total electricity transactions
SELECT 
  COUNT(*) as total_transactions,
  COUNT(CASE WHEN vending_provider = 'ebills' THEN 1 END) as ebills_count,
  COUNT(CASE WHEN vending_provider = 'mobilenig' THEN 1 END) as mobilenig_count,
  COUNT(CASE WHEN vending_provider IS NULL OR vending_provider = '' THEN 1 END) as no_provider_count
FROM electricity_transactions;

-- 2. Check recent electricity transactions
SELECT 
  id,
  user_id,
  provider,
  meter_number,
  meter_type,
  amount,
  purchase_amount,
  charge_fee,
  status,
  vending_provider,
  reference,
  created_at,
  token IS NOT NULL as has_token
FROM electricity_transactions
ORDER BY created_at DESC
LIMIT 20;

-- 3. Check specifically for eBills transactions
SELECT 
  id,
  user_id,
  provider,
  meter_number,
  amount,
  status,
  reference,
  created_at,
  CASE 
    WHEN token IS NOT NULL AND token != '' THEN 'Yes'
    ELSE 'No'
  END as has_token
FROM electricity_transactions
WHERE vending_provider = 'ebills'
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check if there are transactions without vending_provider
SELECT 
  id,
  user_id,
  provider,
  amount,
  status,
  reference,
  created_at
FROM electricity_transactions
WHERE vending_provider IS NULL OR vending_provider = ''
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check RLS policies on electricity_transactions
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'electricity_transactions';

-- 6. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'electricity_transactions';

-- 7. Check for any failed transactions
SELECT 
  id,
  user_id,
  provider,
  amount,
  status,
  vending_provider,
  reference,
  created_at
FROM electricity_transactions
WHERE status != 'completed' AND status != 'success'
ORDER BY created_at DESC
LIMIT 10;

-- 8. Compare electricity_transactions with user_transactions
-- Check if wallet debits are recorded for each electricity purchase
SELECT 
  et.id as elec_id,
  et.reference as elec_ref,
  et.amount as elec_amount,
  et.vending_provider,
  et.created_at as elec_created,
  ut.id as wallet_id,
  ut.reference as wallet_ref,
  ut.amount as wallet_amount,
  ut.created_at as wallet_created
FROM electricity_transactions et
LEFT JOIN user_transactions ut ON et.reference = ut.reference
WHERE et.vending_provider = 'ebills'
ORDER BY et.created_at DESC
LIMIT 10;
