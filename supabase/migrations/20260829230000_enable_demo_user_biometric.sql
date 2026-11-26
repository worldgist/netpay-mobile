-- Enable biometric login for the App Review demo account
UPDATE public.profiles
SET biometric_enabled = true,
    updated_at = now()
WHERE lower(email) = lower('demo@netppay.com');

-- Keep setup_demo_user() in sync for future profile resets
CREATE OR REPLACE FUNCTION public.setup_demo_user()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  demo_user_id UUID;
  demo_email TEXT := 'demo@netppay.com';
  demo_pin TEXT := '1234';
  pin_hash_value TEXT;
BEGIN
  SELECT id INTO demo_user_id
  FROM auth.users
  WHERE email = demo_email
  LIMIT 1;

  IF demo_user_id IS NULL THEN
    RAISE NOTICE 'Demo user does not exist in auth.users. Please create the user first via the create-demo-user edge function or Supabase Auth API.';
    RETURN NULL;
  END IF;

  pin_hash_value := crypt(demo_pin, gen_salt('bf'));

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    balance,
    status,
    pin_hash,
    pin_enabled,
    biometric_enabled
  )
  VALUES (
    demo_user_id,
    demo_email,
    'Demo User',
    '+2347000000000',
    50000.00,
    'active',
    pin_hash_value,
    true,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    balance = 50000.00,
    status = 'active',
    pin_hash = pin_hash_value,
    pin_enabled = true,
    biometric_enabled = true,
    updated_at = now();

  RAISE NOTICE 'Demo user profile set up successfully. Email: %, PIN: %', demo_email, demo_pin;
  RETURN demo_user_id;
END;
$$;
