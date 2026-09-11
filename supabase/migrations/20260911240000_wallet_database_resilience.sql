-- Wallet DB resilience: block client balance writes, tighten ledger access, add indexes/constraints.

CREATE OR REPLACE FUNCTION public.is_wallet_balance_write_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    current_setting('netpay.allow_profile_balance_write', true) = 'true'
    OR coalesce((SELECT auth.jwt()) ->> 'role', '') = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.guard_profiles_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_wallet_balance_write_allowed()
       AND COALESCE(NEW.balance, 0) <> 0 THEN
      NEW.balance := 0;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.balance IS DISTINCT FROM OLD.balance
       AND NOT public.is_wallet_balance_write_allowed() THEN
      RAISE EXCEPTION 'profiles.balance cannot be modified directly; use ledger operations'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_balance ON public.profiles;

CREATE TRIGGER trg_guard_profiles_balance
  BEFORE INSERT OR UPDATE OF balance ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_balance();

COMMENT ON FUNCTION public.guard_profiles_balance() IS
  'Prevents authenticated clients and admins from setting profiles.balance; allows service_role and internal ledger sync.';

CREATE OR REPLACE FUNCTION public.sync_profile_balance_from_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_latest boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.user_transactions ut
    WHERE ut.user_id = NEW.user_id
      AND (
        ut.created_at > NEW.created_at
        OR (ut.created_at = NEW.created_at AND ut.id > NEW.id)
      )
  ) INTO v_is_latest;

  IF v_is_latest THEN
    PERFORM set_config('netpay.allow_profile_balance_write', 'true', true);
    UPDATE public.profiles
    SET
      balance = NEW.balance_after,
      updated_at = now()
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
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
    PERFORM set_config('netpay.allow_profile_balance_write', 'true', true);
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

CREATE OR REPLACE FUNCTION public.sync_profile_balances_from_ledger()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
BEGIN
  PERFORM set_config('netpay.allow_profile_balance_write', 'true', true);

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

CREATE OR REPLACE FUNCTION public.get_my_ledger_balance()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.get_user_ledger_balance(v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_ledger_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_ledger_balance() TO authenticated;

COMMENT ON FUNCTION public.get_my_ledger_balance() IS
  'Returns ledger balance for the current user only (safe for mobile clients).';

DROP POLICY IF EXISTS "Admins can insert transactions" ON public.user_transactions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_transactions_amount_positive'
      AND conrelid = 'public.user_transactions'::regclass
  ) THEN
    ALTER TABLE public.user_transactions
      ADD CONSTRAINT user_transactions_amount_positive CHECK (amount > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_transactions_user_latest
  ON public.user_transactions (user_id, created_at DESC, id DESC);

COMMENT ON INDEX idx_user_transactions_user_latest IS
  'Speeds up latest ledger balance lookups per user.';
