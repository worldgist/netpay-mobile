-- Backfill platform revenue from existing completed data transactions
-- Revenue = custom_price - original_price (or admin_revenue if available)
-- If main price is 100 and custom_price is 150, platform revenue = 50

-- Backfill data transactions
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
  'data' as transaction_type,
  'data_transactions' as transaction_table,
  -- Calculate revenue: admin_revenue if available, otherwise amount - api_cost
  COALESCE(
    admin_revenue,
    CASE 
      WHEN api_cost IS NOT NULL AND amount IS NOT NULL THEN amount - api_cost
      ELSE 0
    END
  ) as revenue_amount,
  COALESCE(api_cost, 0) as purchase_amount,
  0 as charge_fee_rate, -- Not a percentage, it's a fixed markup
  user_id,
  reference as transaction_reference,
  CASE WHEN status = 'success' THEN 'completed' ELSE status END as transaction_status,
  jsonb_build_object(
    'network', network,
    'plan_name', plan_name,
    'phone_number', phone_number,
    'provider', provider
  ) as metadata,
  created_at
FROM public.data_transactions
WHERE (status = 'success' OR status = 'completed')
  AND (
    (admin_revenue IS NOT NULL AND admin_revenue > 0)
    OR
    (api_cost IS NOT NULL AND amount IS NOT NULL AND amount > api_cost)
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = data_transactions.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.platform_revenue 
    WHERE transaction_id = data_transactions.id 
    AND transaction_table = 'data_transactions'
  );

-- Add comment
COMMENT ON TABLE public.platform_revenue IS 'Tracks platform revenue from charge fees and markups on all transactions. Data transactions: revenue = custom_price - original_price';

