-- Prevent duplicate wallet debits for the same purchase reference (double-tap / retry safety).

WITH ranked_debits AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, reference
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.user_transactions
  WHERE reference IS NOT NULL
    AND transaction_type NOT IN ('credit', 'refund')
)
DELETE FROM public.user_transactions ut
USING ranked_debits rd
WHERE ut.id = rd.id
  AND rd.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_transactions_user_reference_debit_unique
  ON public.user_transactions (user_id, reference)
  WHERE reference IS NOT NULL
    AND transaction_type NOT IN ('credit', 'refund');

COMMENT ON INDEX idx_user_transactions_user_reference_debit_unique IS
  'Ensures each purchase/debit reference is applied once per user in the ledger.';
