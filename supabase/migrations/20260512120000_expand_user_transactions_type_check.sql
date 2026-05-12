-- Edge functions use specific purchase types; the previous CHECK only allowed generic types,
-- causing inserts to fail with "violates check constraint" and wallet.ts to throw
-- "Failed to record wallet transaction after debit".

ALTER TABLE public.user_transactions
  DROP CONSTRAINT IF EXISTS user_transactions_transaction_type_check;

ALTER TABLE public.user_transactions
  ADD CONSTRAINT user_transactions_transaction_type_check
  CHECK (
    transaction_type IN (
      'credit',
      'debit',
      'purchase',
      'refund',
      'transfer_fee',
      'funding_fee',
      'airtime_purchase',
      'data_purchase',
      'electricity_purchase',
      'cable_purchase',
      'cable_tv',
      'education_purchase',
      'betting_purchase',
      'referral_withdrawal'
    )
  );

COMMENT ON COLUMN public.user_transactions.transaction_type IS
  'Ledger category: core types (credit, debit, purchase, refund, transfer_fee, funding_fee) plus product-specific debits used by Edge Functions.';
