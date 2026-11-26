-- Atomic wallet mutations: lock user, read ledger balance, append immutable entry.
-- profiles.balance stays a cache updated by trg_sync_profile_balance_on_ledger_insert.

CREATE OR REPLACE FUNCTION public.append_user_ledger_entry(
  p_user_id uuid,
  p_amount numeric,
  p_transaction_type text,
  p_description text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_is_credit boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before numeric;
  v_after numeric;
  v_existing record;
  v_performed uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_user');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  v_performed := COALESCE(p_performed_by, p_user_id);

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  IF p_reference IS NOT NULL AND length(trim(p_reference)) > 0 THEN
    SELECT balance_before, balance_after, amount
    INTO v_existing
    FROM public.user_transactions
    WHERE user_id = p_user_id
      AND reference = p_reference
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    IF FOUND THEN
      IF ABS(v_existing.amount - p_amount) > 0.009 THEN
        RETURN jsonb_build_object('success', false, 'error', 'duplicate_reference_amount_mismatch');
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'already_processed', true,
        'balance_before', v_existing.balance_before,
        'balance_after', v_existing.balance_after,
        'reference', p_reference
      );
    END IF;
  END IF;

  v_before := public.get_user_ledger_balance(p_user_id);

  IF p_is_credit THEN
    v_after := v_before + p_amount;
  ELSE
    IF v_before < p_amount THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'insufficient_balance',
        'available', v_before,
        'required', p_amount
      );
    END IF;
    v_after := v_before - p_amount;
  END IF;

  INSERT INTO public.user_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    description,
    reference,
    performed_by
  ) VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_transaction_type), ''), CASE WHEN p_is_credit THEN 'credit' ELSE 'debit' END),
    p_amount,
    v_before,
    v_after,
    p_description,
    p_reference,
    v_performed
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'balance_before', v_before,
    'balance_after', v_after,
    'reference', p_reference
  );

EXCEPTION
  WHEN unique_violation THEN
    IF p_reference IS NOT NULL THEN
      SELECT balance_before, balance_after
      INTO v_existing
      FROM public.user_transactions
      WHERE user_id = p_user_id
        AND reference = p_reference
      ORDER BY created_at ASC, id ASC
      LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'success', true,
          'already_processed', true,
          'balance_before', v_existing.balance_before,
          'balance_after', v_existing.balance_after,
          'reference', p_reference
        );
      END IF;
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'duplicate_reference');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.append_user_ledger_entry(uuid, numeric, text, text, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_user_ledger_entry(uuid, numeric, text, text, text, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.append_user_ledger_entry IS
  'Append one immutable user_transactions row using ledger balance as source of truth (serialized per user).';
