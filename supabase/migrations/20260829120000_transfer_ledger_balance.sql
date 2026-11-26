-- Internal transfers: use ledger balance as source of truth and sync profile via ledger trigger only.

CREATE OR REPLACE FUNCTION public.execute_internal_transfer(
  p_sender_id uuid,
  p_recipient_id uuid,
  p_amount numeric,
  p_transfer_fee numeric,
  p_reference text,
  p_fee_reference text,
  p_description text,
  p_sender_email text,
  p_recipient_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_bal numeric;
  v_recipient_bal numeric;
  v_total numeric;
  v_sender_after_principal numeric;
  v_sender_final numeric;
  v_recipient_final numeric;
  v_sender_debit_desc text;
  v_fee_desc text;
  v_recipient_credit_desc text;
BEGIN
  IF p_sender_id IS NULL OR p_recipient_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_user');
  END IF;

  IF p_sender_id = p_recipient_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'same_sender_recipient');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_transfer_fee IS NULL OR p_transfer_fee < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amounts');
  END IF;

  IF p_reference IS NULL OR length(trim(p_reference)) = 0 OR p_fee_reference IS NULL OR length(trim(p_fee_reference)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_reference');
  END IF;

  v_total := p_amount + p_transfer_fee;

  -- Lock both profiles in deterministic UUID order to avoid deadlocks.
  IF p_sender_id < p_recipient_id THEN
    PERFORM 1 FROM public.profiles WHERE id = p_sender_id FOR UPDATE;
    PERFORM 1 FROM public.profiles WHERE id = p_recipient_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.profiles WHERE id = p_recipient_id FOR UPDATE;
    PERFORM 1 FROM public.profiles WHERE id = p_sender_id FOR UPDATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_sender_id)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_recipient_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  v_sender_bal := public.get_user_ledger_balance(p_sender_id);
  v_recipient_bal := public.get_user_ledger_balance(p_recipient_id);

  IF v_sender_bal < v_total THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_balance',
      'required', v_total,
      'available', v_sender_bal
    );
  END IF;

  v_sender_after_principal := v_sender_bal - p_amount;
  v_sender_final := v_sender_after_principal - p_transfer_fee;
  v_recipient_final := v_recipient_bal + p_amount;

  v_sender_debit_desc := coalesce(nullif(trim(p_description), ''), 'Transfer to ' || coalesce(p_recipient_email, 'recipient'));
  v_fee_desc := 'Transfer fee for transfer to ' || coalesce(p_recipient_email, 'recipient');
  v_recipient_credit_desc := coalesce(nullif(trim(p_description), ''), 'Transfer from ' || coalesce(p_sender_email, 'NetPay user'));

  INSERT INTO public.user_transactions (
    user_id, transaction_type, amount, balance_before, balance_after, description, reference, performed_by
  ) VALUES (
    p_sender_id, 'debit', p_amount, v_sender_bal, v_sender_after_principal, v_sender_debit_desc, p_reference, p_sender_id
  );

  INSERT INTO public.user_transactions (
    user_id, transaction_type, amount, balance_before, balance_after, description, reference, performed_by
  ) VALUES (
    p_sender_id, 'transfer_fee', p_transfer_fee, v_sender_after_principal, v_sender_final, v_fee_desc, p_fee_reference, p_sender_id
  );

  INSERT INTO public.user_transactions (
    user_id, transaction_type, amount, balance_before, balance_after, description, reference, performed_by
  ) VALUES (
    p_recipient_id, 'credit', p_amount, v_recipient_bal, v_recipient_final, v_recipient_credit_desc, p_reference, p_sender_id
  );

  INSERT INTO public.transfer_transactions (
    sender_id, recipient_id, amount, description, reference, status,
    sender_balance_before, sender_balance_after, recipient_balance_before, recipient_balance_after
  ) VALUES (
    p_sender_id, p_recipient_id, p_amount, p_description, p_reference, 'completed',
    v_sender_bal, v_sender_final, v_recipient_bal, v_recipient_final
  );

  RETURN jsonb_build_object(
    'success', true,
    'sender_balance_before', v_sender_bal,
    'sender_balance_after', v_sender_final,
    'recipient_balance_before', v_recipient_bal,
    'recipient_balance_after', v_recipient_final,
    'sender_after_principal', v_sender_after_principal
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_reference');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'transfer_failed', 'detail', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.execute_internal_transfer(uuid, uuid, numeric, numeric, text, text, text, text, text) IS
  'Atomically moves p_amount from sender to recipient and debits p_transfer_fee from sender using ledger balances; profile cache syncs via ledger trigger.';

REVOKE ALL ON FUNCTION public.execute_internal_transfer(uuid, uuid, numeric, numeric, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_internal_transfer(uuid, uuid, numeric, numeric, text, text, text, text, text) TO service_role;
