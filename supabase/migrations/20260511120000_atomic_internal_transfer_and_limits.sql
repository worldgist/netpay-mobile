-- Atomic P2P transfer (row locks + single transaction) and default risk limits in app_settings.

CREATE INDEX IF NOT EXISTS idx_transfer_transactions_sender_created_at
  ON public.transfer_transactions (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transfer_transactions_recipient_created_at
  ON public.transfer_transactions (recipient_id, created_at DESC);

-- Single-flight internal transfer: locks profiles in UUID order, debits sender (amount + fee), credits recipient.
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
    SELECT balance INTO v_sender_bal FROM public.profiles WHERE id = p_sender_id FOR UPDATE;
    SELECT balance INTO v_recipient_bal FROM public.profiles WHERE id = p_recipient_id FOR UPDATE;
  ELSE
    SELECT balance INTO v_recipient_bal FROM public.profiles WHERE id = p_recipient_id FOR UPDATE;
    SELECT balance INTO v_sender_bal FROM public.profiles WHERE id = p_sender_id FOR UPDATE;
  END IF;

  IF v_sender_bal IS NULL OR v_recipient_bal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

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

  UPDATE public.profiles SET balance = v_sender_final, updated_at = now() WHERE id = p_sender_id;
  UPDATE public.profiles SET balance = v_recipient_final, updated_at = now() WHERE id = p_recipient_id;

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
    v_sender_bal, v_sender_after_principal, v_recipient_bal, v_recipient_final
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
  'Atomically moves p_amount from sender to recipient and debits p_transfer_fee from sender; row-locks profiles. Invoked by transfer-funds Edge Function (service role).';

REVOKE ALL ON FUNCTION public.execute_internal_transfer(uuid, uuid, numeric, numeric, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_internal_transfer(uuid, uuid, numeric, numeric, text, text, text, text, text) TO service_role;

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'transfer_risk_limits',
  '{
    "max_single_txn": 500000,
    "daily_outflow_cap": 5000000,
    "hourly_txn_count_cap": 40,
    "new_account_days": 7,
    "new_account_daily_outflow_cap": 500000
  }'::jsonb,
  'limits',
  'P2P transfer risk controls: max per txn, daily sender outflow, hourly txn count, stricter daily cap for new accounts (created_at).'
)
ON CONFLICT (setting_key) DO NOTHING;
