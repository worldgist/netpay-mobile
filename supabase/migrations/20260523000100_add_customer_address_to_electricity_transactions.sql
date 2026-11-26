-- Add optional customer address for electricity transaction receipts/details.
-- This prevents query failures when clients select customer_address.
ALTER TABLE public.electricity_transactions
  ADD COLUMN IF NOT EXISTS customer_address text;
