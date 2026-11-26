-- Ensure service-role Edge Functions can always write ledger entries.
-- This prevents runtime failures like:
-- "new row violates row-level security policy for table user_transactions"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_transactions'
      AND policyname = 'Service role can insert user transactions'
  ) THEN
    CREATE POLICY "Service role can insert user transactions"
      ON public.user_transactions
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;
