-- Ensure service_role can update profiles (should bypass RLS, but adding explicit policy for safety)
-- This is a safety measure to ensure the webhook can update user balances

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Service role can update profiles" ON public.profiles;

-- Create policy to allow service_role to update profiles
CREATE POLICY "Service role can update profiles"
  ON public.profiles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also ensure service_role can select profiles (for verification)
DROP POLICY IF EXISTS "Service role can select profiles" ON public.profiles;

CREATE POLICY "Service role can select profiles"
  ON public.profiles
  FOR SELECT
  TO service_role
  USING (true);

-- Add comment
COMMENT ON POLICY "Service role can update profiles" ON public.profiles IS 
  'Allows service_role (used by Edge Functions) to update user balances for wallet funding';




























