-- Add 'transfer_fee' and 'funding_fee' to allowed transaction types
-- This allows better tracking of transfer fees and funding fees separately from regular debits

-- Drop the existing CHECK constraint
ALTER TABLE public.user_transactions 
  DROP CONSTRAINT IF EXISTS user_transactions_transaction_type_check;

-- Re-add the constraint with the new transaction types
ALTER TABLE public.user_transactions 
  ADD CONSTRAINT user_transactions_transaction_type_check 
  CHECK (transaction_type IN ('credit', 'debit', 'purchase', 'refund', 'transfer_fee', 'funding_fee'));

-- Add comment explaining the new types
COMMENT ON COLUMN public.user_transactions.transaction_type IS 
  'Transaction type: credit (money added), debit (money removed), purchase (service purchase), refund (money returned), transfer_fee (fee for transferring money), funding_fee (fee for adding money to wallet)';




























