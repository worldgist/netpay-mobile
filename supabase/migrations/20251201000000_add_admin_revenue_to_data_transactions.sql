-- Add columns to track admin revenue from data plan markups
-- admin_revenue = amount user paid - amount sent to API
ALTER TABLE public.data_transactions
  ADD COLUMN IF NOT EXISTS api_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS admin_revenue NUMERIC;

-- Add comments to document the revenue tracking
COMMENT ON COLUMN public.data_transactions.api_cost IS 'Amount sent to the API provider (original_price)';
COMMENT ON COLUMN public.data_transactions.admin_revenue IS 'Admin revenue/margin: amount user paid - api_cost';
COMMENT ON COLUMN public.data_transactions.amount IS 'Amount charged to user (custom_price or original_price)';


