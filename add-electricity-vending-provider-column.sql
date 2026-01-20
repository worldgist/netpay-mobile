-- Add vending_provider column to electricity_transactions table
-- This allows tracking which payment provider (vtpass or ebills) was used for the transaction
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/sql

-- Add the column if it doesn't exist
ALTER TABLE public.electricity_transactions 
  ADD COLUMN IF NOT EXISTS vending_provider TEXT CHECK (vending_provider IN ('vtpass', 'ebills'));

-- Set default value for existing records (assuming they used vtpass)
UPDATE public.electricity_transactions 
SET vending_provider = 'vtpass' 
WHERE vending_provider IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_electricity_transactions_vending_provider 
ON public.electricity_transactions(vending_provider);

-- Add comment
COMMENT ON COLUMN public.electricity_transactions.vending_provider IS 'The payment provider used for this transaction (vtpass or ebills)';

-- Verify the migration
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'electricity_transactions' 
AND column_name = 'vending_provider';
