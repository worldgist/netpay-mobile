-- Create electricity_transactions table if it doesn't exist (with charge_fee support)
CREATE TABLE IF NOT EXISTS public.electricity_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  purchase_amount NUMERIC,
  charge_fee NUMERIC DEFAULT 0,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  meter_number TEXT NOT NULL,
  provider TEXT NOT NULL,
  meter_type TEXT NOT NULL,
  customer_name TEXT,
  token TEXT,
  api_response JSONB,
  performed_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add charge_fee column if table exists but column doesn't (for existing tables)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'electricity_transactions') THEN
    ALTER TABLE public.electricity_transactions
      ADD COLUMN IF NOT EXISTS charge_fee NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS purchase_amount NUMERIC;
  END IF;
END $$;

-- Add comments to document the fee structure
COMMENT ON COLUMN public.electricity_transactions.charge_fee IS '10% charge fee on electricity purchases (10% of purchase_amount)';
COMMENT ON COLUMN public.electricity_transactions.purchase_amount IS 'Original purchase amount before fees (amount charged to user = purchase_amount + charge_fee)';
COMMENT ON COLUMN public.electricity_transactions.amount IS 'Total amount charged to user (purchase_amount + charge_fee)';

-- For existing records, set purchase_amount to current amount and charge_fee to 0
-- (Existing records won't have the fee applied retroactively)
UPDATE public.electricity_transactions
SET 
  purchase_amount = amount,
  charge_fee = 0
WHERE purchase_amount IS NULL;

-- Enable RLS if table exists (will be a no-op if already enabled)
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

-- Create updated_at trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_electricity_transactions_updated_at'
  ) THEN
    CREATE TRIGGER update_electricity_transactions_updated_at
    BEFORE UPDATE ON public.electricity_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Note: For new records going forward:
-- 1. Set purchase_amount = base purchase amount (e.g., 1000)
-- 2. Calculate charge_fee = purchase_amount * 0.1 (10% fee = 100)
-- 3. Set amount = purchase_amount + charge_fee (total = 1100)

