-- Automatically keep profiles.balance in sync with the latest ledger entry.
-- Profile cache updates on every new user_transactions row that becomes the latest entry.

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
    UPDATE public.profiles
    SET
      balance = NEW.balance_after,
      updated_at = now()
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_balance_on_ledger_insert ON public.user_transactions;

CREATE TRIGGER trg_sync_profile_balance_on_ledger_insert
AFTER INSERT ON public.user_transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_balance_from_ledger_entry();

-- Backfill any existing drift once.
DO $$
DECLARE
  v_result json;
BEGIN
  v_result := public.sync_profile_balances_from_ledger();
  RAISE NOTICE 'Ledger auto-sync backfill: %', v_result;
END;
$$;

COMMENT ON FUNCTION public.sync_profile_balance_from_ledger_entry() IS
  'Trigger function: updates profiles.balance from balance_after when a new ledger row is the latest entry.';
