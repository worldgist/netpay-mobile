-- Ledger (user_transactions.balance_after) is the authoritative user wallet balance.
-- profiles.balance is kept in sync as a read cache for the app.

CREATE OR REPLACE FUNCTION public.get_user_ledger_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ut.balance_after
      FROM public.user_transactions ut
      WHERE ut.user_id = p_user_id
      ORDER BY ut.created_at DESC, ut.id DESC
      LIMIT 1
    ),
    (SELECT p.balance FROM public.profiles p WHERE p.id = p_user_id),
    0::numeric
  );
$$;

CREATE OR REPLACE FUNCTION public.get_ledger_balance_summary()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (ut.user_id)
      ut.user_id,
      ut.balance_after AS ledger_balance
    FROM public.user_transactions ut
    ORDER BY ut.user_id, ut.created_at DESC, ut.id DESC
  ),
  combined AS (
    SELECT
      p.id AS user_id,
      COALESCE(l.ledger_balance, COALESCE(p.balance, 0)) AS ledger_balance,
      COALESCE(p.balance, 0) AS profile_balance
    FROM public.profiles p
    LEFT JOIN latest l ON l.user_id = p.id
  )
  SELECT json_build_object(
    'total_ledger_liability', COALESCE(SUM(c.ledger_balance), 0),
    'total_profile_balance', COALESCE(SUM(c.profile_balance), 0),
    'total_drift', COALESCE(SUM(ABS(c.ledger_balance - c.profile_balance)), 0),
    'mismatch_count', COUNT(*) FILTER (WHERE ABS(c.ledger_balance - c.profile_balance) > 0.009),
    'users_with_ledger', (SELECT COUNT(*) FROM latest),
    'total_users', COUNT(*)
  )
  FROM combined c;
$$;

CREATE OR REPLACE FUNCTION public.get_ledger_balance_mismatches(p_limit int DEFAULT 50)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  ledger_balance numeric,
  profile_balance numeric,
  drift numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (ut.user_id)
      ut.user_id,
      ut.balance_after AS ledger_balance
    FROM public.user_transactions ut
    ORDER BY ut.user_id, ut.created_at DESC, ut.id DESC
  )
  SELECT
    p.id AS user_id,
    p.full_name,
    p.email,
    COALESCE(l.ledger_balance, COALESCE(p.balance, 0)) AS ledger_balance,
    COALESCE(p.balance, 0) AS profile_balance,
    COALESCE(l.ledger_balance, COALESCE(p.balance, 0)) - COALESCE(p.balance, 0) AS drift
  FROM public.profiles p
  LEFT JOIN latest l ON l.user_id = p.id
  WHERE ABS(COALESCE(l.ledger_balance, COALESCE(p.balance, 0)) - COALESCE(p.balance, 0)) > 0.009
  ORDER BY ABS(COALESCE(l.ledger_balance, COALESCE(p.balance, 0)) - COALESCE(p.balance, 0)) DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_balances_from_ledger()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (ut.user_id)
      ut.user_id,
      ut.balance_after
    FROM public.user_transactions ut
    ORDER BY ut.user_id, ut.created_at DESC, ut.id DESC
  )
  UPDATE public.profiles p
  SET
    balance = l.balance_after,
    updated_at = now()
  FROM latest l
  WHERE p.id = l.user_id
    AND ABS(COALESCE(p.balance, 0) - l.balance_after) > 0.009;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'updated_count', v_updated
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_ledger_balance(uuid) IS
  'Returns the latest balance_after from user_transactions for a user; falls back to profiles.balance.';

COMMENT ON FUNCTION public.get_ledger_balance_summary() IS
  'Platform-wide ledger liability vs cached profile balances for admin treasury/ledger.';

COMMENT ON FUNCTION public.sync_profile_balances_from_ledger() IS
  'Updates profiles.balance from the latest ledger entry per user. Admin/service use only.';
