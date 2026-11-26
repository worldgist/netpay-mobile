-- Remove duplicate funding credits, rebuild affected ledger balances, then enforce uniqueness.

WITH ranked_credits AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, reference
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.user_transactions
  WHERE reference IS NOT NULL
    AND transaction_type IN ('credit', 'refund')
)
DELETE FROM public.user_transactions ut
USING ranked_credits rc
WHERE ut.id = rc.id
  AND rc.rn > 1;

WITH ranked_funding AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY reference
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.funding_transactions
  WHERE reference IS NOT NULL
)
DELETE FROM public.funding_transactions ft
USING ranked_funding rf
WHERE ft.id = rf.id
  AND rf.rn > 1;

WITH recalc AS (
  SELECT
    ut.id,
    COALESCE(
      SUM(
        CASE
          WHEN ut.transaction_type IN ('credit', 'refund') THEN ut.amount
          ELSE -ut.amount
        END
      ) OVER (
        PARTITION BY ut.user_id
        ORDER BY ut.created_at ASC, ut.id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS balance_before_calc,
    SUM(
      CASE
        WHEN ut.transaction_type IN ('credit', 'refund') THEN ut.amount
        ELSE -ut.amount
      END
    ) OVER (
      PARTITION BY ut.user_id
      ORDER BY ut.created_at ASC, ut.id ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS balance_after_calc
  FROM public.user_transactions ut
)
UPDATE public.user_transactions ut
SET
  balance_before = ROUND(r.balance_before_calc::numeric, 2),
  balance_after = ROUND(r.balance_after_calc::numeric, 2)
FROM recalc r
WHERE ut.id = r.id;

UPDATE public.profiles p
SET
  balance = latest.balance_after,
  updated_at = now()
FROM (
  SELECT DISTINCT ON (user_id)
    user_id,
    balance_after
  FROM public.user_transactions
  ORDER BY user_id, created_at DESC, id DESC
) latest
WHERE p.id = latest.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_transactions_user_reference_credit_unique
  ON public.user_transactions (user_id, reference)
  WHERE reference IS NOT NULL
    AND transaction_type IN ('credit', 'refund');

CREATE UNIQUE INDEX IF NOT EXISTS idx_funding_transactions_reference_unique
  ON public.funding_transactions (reference)
  WHERE reference IS NOT NULL;

COMMENT ON INDEX idx_user_transactions_user_reference_credit_unique IS
  'Ensures each funding/payment reference can only create one credit ledger row per user.';

COMMENT ON INDEX idx_funding_transactions_reference_unique IS
  'Ensures each external funding reference is recorded once in funding_transactions.';
