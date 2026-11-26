-- Seed Flutterwave demo virtual account, NIN, and funding history for demo@netppay.com
DO $$
DECLARE
  demo_uid uuid;
BEGIN
  SELECT id INTO demo_uid
  FROM auth.users
  WHERE lower(email) = lower('demo@netppay.com')
  LIMIT 1;

  IF demo_uid IS NULL THEN
    RAISE NOTICE 'Demo auth user not found; skip demo wallet seed.';
    RETURN;
  END IF;

  DELETE FROM public.virtual_accounts
  WHERE user_id = demo_uid
    AND bank_code <> 'FLW';

  INSERT INTO public.virtual_accounts (
    user_id,
    business_id,
    bank_code,
    bank_name,
    account_number,
    account_name,
    tracking_reference,
    provider,
    nin,
    bvn
  )
  VALUES (
    demo_uid,
    'flutterwave',
    'FLW',
    'Flutterwave',
    '8923456789',
    'DEMO USER',
    'netpay-demo-flw-001',
    'flutterwave',
    '12345678901',
    NULL
  )
  ON CONFLICT (user_id, bank_code) DO UPDATE
  SET
    business_id = EXCLUDED.business_id,
    bank_name = EXCLUDED.bank_name,
    account_number = EXCLUDED.account_number,
    account_name = EXCLUDED.account_name,
    tracking_reference = EXCLUDED.tracking_reference,
    provider = EXCLUDED.provider,
    nin = EXCLUDED.nin,
    bvn = NULL,
    updated_at = now();

  INSERT INTO public.user_nin (user_id, nin, provider, verified_at, updated_at)
  VALUES (demo_uid, '12345678901', 'flutterwave', now(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    nin = EXCLUDED.nin,
    provider = EXCLUDED.provider,
    verified_at = EXCLUDED.verified_at,
    updated_at = now();

  DELETE FROM public.funding_transactions
  WHERE user_id = demo_uid
    AND (
      reference LIKE 'DEMO-FLW-FUNDING%'
      OR reference = 'DEMO-FUNDING-001'
    );

  INSERT INTO public.funding_transactions (
    user_id,
    amount,
    bank_name,
    account_number,
    account_name,
    reference,
    status,
    api_response,
    created_at,
    updated_at
  )
  VALUES
    (
      demo_uid,
      50000,
      'Flutterwave',
      '8923456789',
      'DEMO USER',
      'DEMO-FLW-FUNDING-001',
      'completed',
      '{"demo": true, "provider": "flutterwave", "source": "demo_seed"}'::jsonb,
      now() - interval '10 days',
      now() - interval '10 days'
    ),
    (
      demo_uid,
      25000,
      'Flutterwave',
      '8923456789',
      'DEMO USER',
      'DEMO-FLW-FUNDING-002',
      'completed',
      '{"demo": true, "provider": "flutterwave", "source": "demo_seed"}'::jsonb,
      now() - interval '3 days',
      now() - interval '3 days'
    ),
    (
      demo_uid,
      10000,
      'Flutterwave',
      '8923456789',
      'DEMO USER',
      'DEMO-FLW-FUNDING-PENDING',
      'pending',
      '{"demo": true, "provider": "flutterwave", "source": "demo_seed"}'::jsonb,
      now(),
      now()
    );
END $$;
