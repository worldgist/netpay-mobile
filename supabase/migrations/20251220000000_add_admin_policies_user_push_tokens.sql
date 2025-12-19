-- Add admin policies for user_push_tokens table
-- Allow admins to view all push tokens for notification management

-- Policy: Admins can view all push tokens
-- Drop policy if it exists, then create it
DROP POLICY IF EXISTS "Admins can view all push tokens" ON public.user_push_tokens;

CREATE POLICY "Admins can view all push tokens"
ON public.user_push_tokens
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Users can still view their own push tokens (keep existing policy)
-- This is already created in the original migration, but we ensure it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_push_tokens' 
    AND policyname = 'Users can view their push tokens'
  ) THEN
    CREATE POLICY "Users can view their push tokens"
    ON public.user_push_tokens
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

