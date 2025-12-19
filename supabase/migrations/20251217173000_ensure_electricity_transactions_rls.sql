-- Ensure RLS is enabled on electricity_transactions table
ALTER TABLE public.electricity_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies if they don't exist
DO $$
BEGIN
  -- Policy: Users can view their own electricity transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'electricity_transactions' 
    AND policyname = 'Users can view their own electricity transactions'
  ) THEN
    CREATE POLICY "Users can view their own electricity transactions"
    ON public.electricity_transactions
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  -- Policy: Admins can view all electricity transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'electricity_transactions' 
    AND policyname = 'Admins can view all electricity transactions'
  ) THEN
    CREATE POLICY "Admins can view all electricity transactions"
    ON public.electricity_transactions
    FOR SELECT
    USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;

  -- Policy: System can insert electricity transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'electricity_transactions' 
    AND policyname = 'System can insert electricity transactions'
  ) THEN
    CREATE POLICY "System can insert electricity transactions"
    ON public.electricity_transactions
    FOR INSERT
    WITH CHECK (true);
  END IF;

  -- Policy: Admins can update electricity transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'electricity_transactions' 
    AND policyname = 'Admins can update electricity transactions'
  ) THEN
    CREATE POLICY "Admins can update electricity transactions"
    ON public.electricity_transactions
    FOR UPDATE
    USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;



