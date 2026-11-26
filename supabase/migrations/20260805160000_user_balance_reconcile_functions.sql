-- Per-user balance reconcile detail and sync for admin treasury/ledger tooling.

CREATE OR REPLACE FUNCTION public.get_user_balance_reconcile_detail(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_latest public.user_transactions%ROWTYPE;
  v_ledger_balance numeric;
  v_drift numeric;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT * INTO v_latest
  FROM public.user_transactions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  v_ledger_balance := COALESCE(v_latest.balance_after, v_profile.balance, 0);
  v_drift := v_ledger_balance - COALESCE(v_profile.balance, 0);

  RETURN json_build_object(
    'success', true,
    'user_id', v_profile.id,
    'full_name', v_profile.full_name,
    'email', v_profile.email,
    'phone', v_profile.phone,
    'status', v_profile.status,
    'profile_balance', COALESCE(v_profile.balance, 0),
    'ledger_balance', v_ledger_balance,
    'drift', v_drift,
    'needs_reconcile', ABS(v_drift) > 0.009,
    'has_ledger_entries', v_latest.id IS NOT NULL,
    'latest_entry', CASE
      WHEN v_latest.id IS NOT NULL THEN json_build_object(
        'id', v_latest.id,
        'balance_before', v_latest.balance_before,
        'balance_after', v_latest.balance_after,
        'amount', v_latest.amount,
        'transaction_type', v_latest.transaction_type,
        'reference', v_latest.reference,
        'description', v_latest.description,
        'created_at', v_latest.created_at
      )
      ELSE NULL
    END,
    'profile_updated_at', v_profile.updated_at,
    'reconcile_action', CASE
      WHEN v_latest.id IS NULL THEN 'No ledger entries — profile cache is used as fallback'
      WHEN ABS(v_drift) <= 0.009 THEN 'Balances match — no action needed'
      ELSE 'Update profile cache from latest ledger balance_after'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_profile_balance_from_ledger(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_balance numeric;
  v_ledger_balance numeric;
  v_updated boolean := false;
BEGIN
  SELECT COALESCE(balance, 0) INTO v_profile_balance
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  SELECT balance_after INTO v_ledger_balance
  FROM public.user_transactions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_ledger_balance IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No ledger entries for this user',
      'user_id', p_user_id,
      'profile_balance', v_profile_balance
    );
  END IF;

  IF ABS(v_profile_balance - v_ledger_balance) > 0.009 THEN
    UPDATE public.profiles
    SET balance = v_ledger_balance, updated_at = now()
    WHERE id = p_user_id;
    v_updated := true;
  END IF;

  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'updated', v_updated,
    'profile_balance_before', v_profile_balance,
    'profile_balance_after', v_ledger_balance,
    'ledger_balance', v_ledger_balance,
    'drift_before', v_ledger_balance - v_profile_balance,
    'drift_after', 0
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_balance_reconcile_detail(uuid) IS
  'Admin detail for a user''s ledger vs profile cache balance drift.';

COMMENT ON FUNCTION public.sync_user_profile_balance_from_ledger(uuid) IS
  'Sync one user profiles.balance from their latest ledger entry.';
