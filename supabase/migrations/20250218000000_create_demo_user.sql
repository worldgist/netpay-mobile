-- Create demo user for Apple App Review and testing
-- This migration creates a helper function to set up a demo user

-- Function to create or update demo user profile
-- Note: The auth user must be created first via Supabase Auth API or Edge Function
CREATE OR REPLACE FUNCTION public.setup_demo_user()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  demo_user_id UUID;
  demo_email TEXT := 'demo@netppay.com';
  demo_password TEXT := 'Demo@1234'; -- Simple password for reviewers
  demo_pin TEXT := '1234'; -- Simple PIN for reviewers
  pin_hash_value TEXT;
BEGIN
  -- Try to find existing demo user by email
  SELECT id INTO demo_user_id
  FROM auth.users
  WHERE email = demo_email
  LIMIT 1;

  -- If user doesn't exist, we'll need to create it via the edge function
  -- This function assumes the user exists in auth.users
  IF demo_user_id IS NULL THEN
    RAISE NOTICE 'Demo user does not exist in auth.users. Please create the user first via the create-demo-user edge function or Supabase Auth API.';
    RETURN NULL;
  END IF;

  -- Hash the PIN using pgcrypto
  pin_hash_value := crypt(demo_pin, gen_salt('bf'));

  -- Ensure profile exists with demo data
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
    50000.00, -- Give demo user ₦50,000 balance for testing
    'active',
    pin_hash_value,
    true, -- PIN enabled
    false -- Biometric disabled (can be enabled in app)
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    balance = 50000.00, -- Reset balance to demo amount
    status = 'active',
    pin_hash = pin_hash_value,
    pin_enabled = true,
    biometric_enabled = false,
    updated_at = now();

  RAISE NOTICE 'Demo user profile set up successfully. Email: %, PIN: %', demo_email, demo_pin;
  RETURN demo_user_id;
END;
$$;

-- Function to set up PIN hash for demo user
CREATE OR REPLACE FUNCTION public.setup_demo_user_pin(user_id_param UUID, pin_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pin_hash_value TEXT;
BEGIN
  -- Hash the PIN using pgcrypto
  pin_hash_value := crypt(pin_value, gen_salt('bf'));
  
  -- Update the profile with the hashed PIN
  UPDATE public.profiles
  SET pin_hash = pin_hash_value,
      pin_enabled = true,
      updated_at = now()
  WHERE id = user_id_param;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error setting PIN for user %: %', user_id_param, SQLERRM;
    RETURN FALSE;
END;
$$;

-- Grant execute permission on the functions
GRANT EXECUTE ON FUNCTION public.setup_demo_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.setup_demo_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_demo_user_pin(UUID, TEXT) TO service_role;

