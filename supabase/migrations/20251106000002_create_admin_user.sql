-- Create admin user helper function
-- Note: This function assumes the user already exists in auth.users
-- You'll need to create the user via Supabase Auth API first, then run this

-- Function to grant admin role to an existing user by email
CREATE OR REPLACE FUNCTION public.grant_admin_role_by_email(user_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Find user by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found. Please create the user first via Supabase Auth.', user_email;
  END IF;

  -- Ensure profile exists
  INSERT INTO public.profiles (id, email, full_name, balance, status)
  VALUES (
    target_user_id,
    user_email,
    COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = target_user_id), split_part(user_email, '@', 1)),
    0.00,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  -- Grant admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN target_user_id;
END;
$$;

-- Grant admin role to the specified user
-- This will work if the user already exists in auth.users
DO $$
DECLARE
  user_id_found UUID;
BEGIN
  -- Try to find the user
  SELECT id INTO user_id_found
  FROM auth.users
  WHERE email = 'oluwapainz@gmail.com'
  LIMIT 1;

  IF user_id_found IS NOT NULL THEN
    -- User exists, grant admin role
    PERFORM public.grant_admin_role_by_email('oluwapainz@gmail.com');
    RAISE NOTICE 'Admin role granted to user: oluwapainz@gmail.com';
  ELSE
    RAISE NOTICE 'User oluwapainz@gmail.com not found in auth.users. Please create the user first via Supabase Auth API or dashboard, then run: SELECT public.grant_admin_role_by_email(''oluwapainz@gmail.com'');';
  END IF;
END $$;
