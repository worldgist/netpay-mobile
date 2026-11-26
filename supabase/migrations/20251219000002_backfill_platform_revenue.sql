-- Backfill platform revenue from existing completed transactions
-- This migration records revenue from all historical completed transactions

-- Backfill education transactions
INSERT INTO public.platform_revenue (
  transaction_id,
  transaction_type,
  transaction_table,
  revenue_amount,
  purchase_amount,
  charge_fee_rate,
  user_id,
  transaction_reference,
  transaction_status,
  metadata,
  created_at
)
SELECT 
  id as transaction_id,
  'education' as transaction_type,
  'education_transactions' as transaction_table,
  COALESCE(charge_fee, 0) as revenue_amount,
  COALESCE(purchase_amount, amount - COALESCE(charge_fee, 0)) as purchase_amount,
  0.07 as charge_fee_rate, -- 7% for education
  user_id,
  reference as transaction_reference,
  status as transaction_status,
  jsonb_build_object(
    'exam_type', exam_type,
    'phone_number', phone_number
  ) as metadata,
  created_at
FROM public.education_transactions
WHERE status = 'completed'
  AND charge_fee IS NOT NULL
  AND charge_fee > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.platform_revenue 
    WHERE transaction_id = education_transactions.id 
    AND transaction_table = 'education_transactions'
  );

-- Backfill electricity transactions
INSERT INTO public.platform_revenue (
  transaction_id,
  transaction_type,
  transaction_table,
  revenue_amount,
  purchase_amount,
  charge_fee_rate,
  user_id,
  transaction_reference,
  transaction_status,
  metadata,
  created_at
)
SELECT 
  id as transaction_id,
  'electricity' as transaction_type,
  'electricity_transactions' as transaction_table,
  COALESCE(charge_fee, 0) as revenue_amount,
  COALESCE(purchase_amount, amount - COALESCE(charge_fee, 0)) as purchase_amount,
  0.10 as charge_fee_rate, -- 10% for electricity
  user_id,
  reference as transaction_reference,
  status as transaction_status,
  jsonb_build_object(
    'provider', provider,
    'meter_number', meter_number,
    'meter_type', meter_type,
    'customer_name', customer_name
  ) as metadata,
  created_at
FROM public.electricity_transactions
WHERE status = 'completed'
  AND charge_fee IS NOT NULL
  AND charge_fee > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.platform_revenue 
    WHERE transaction_id = electricity_transactions.id 
    AND transaction_table = 'electricity_transactions'
  );

-- Add comment
COMMENT ON TABLE public.platform_revenue IS 'Backfilled with historical transaction data on 2025-12-19';















