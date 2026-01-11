-- Create cable_tv_transactions table if it doesn't exist (with 2% charge_fee support)
CREATE TABLE IF NOT EXISTS public.cable_tv_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  purchase_amount NUMERIC,
  charge_fee NUMERIC DEFAULT 0,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  smartcard_number TEXT NOT NULL,
  provider TEXT NOT NULL,
  plan_name TEXT,
  customer_name TEXT,
  subscription_type TEXT,
  api_response JSONB,
  performed_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add charge_fee and purchase_amount columns if table exists but columns don't (for existing tables)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cable_tv_transactions') THEN
    ALTER TABLE public.cable_tv_transactions
      ADD COLUMN IF NOT EXISTS charge_fee NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS purchase_amount NUMERIC;
  END IF;
END $$;

-- Add comments to document the fee structure
COMMENT ON COLUMN public.cable_tv_transactions.charge_fee IS '2% charge fee on cable TV purchases (2% of purchase_amount)';
COMMENT ON COLUMN public.cable_tv_transactions.purchase_amount IS 'Original purchase amount before fees (amount charged to user = purchase_amount + charge_fee)';
COMMENT ON COLUMN public.cable_tv_transactions.amount IS 'Total amount charged to user (purchase_amount + charge_fee)';

-- For existing records, set purchase_amount to current amount and charge_fee to 0
-- (Existing records won't have the fee applied retroactively)
UPDATE public.cable_tv_transactions
SET 
  purchase_amount = amount,
  charge_fee = 0
WHERE purchase_amount IS NULL;

-- Enable RLS if table exists (will be a no-op if already enabled)
ALTER TABLE public.cable_tv_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies if they don't exist
DO $$
BEGIN
  -- Policy: Users can view their own cable TV transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'cable_tv_transactions' 
    AND policyname = 'Users can view their own cable TV transactions'
  ) THEN
    CREATE POLICY "Users can view their own cable TV transactions"
    ON public.cable_tv_transactions
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  -- Policy: Admins can view all cable TV transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'cable_tv_transactions' 
    AND policyname = 'Admins can view all cable TV transactions'
  ) THEN
    CREATE POLICY "Admins can view all cable TV transactions"
    ON public.cable_tv_transactions
    FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;

  -- Policy: System can insert cable TV transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'cable_tv_transactions' 
    AND policyname = 'System can insert cable TV transactions'
  ) THEN
    CREATE POLICY "System can insert cable TV transactions"
    ON public.cable_tv_transactions
    FOR INSERT
    WITH CHECK (true);
  END IF;

  -- Policy: Admins can update cable TV transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'cable_tv_transactions' 
    AND policyname = 'Admins can update cable TV transactions'
  ) THEN
    CREATE POLICY "Admins can update cable TV transactions"
    ON public.cable_tv_transactions
    FOR UPDATE
    USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- Create updated_at trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_cable_tv_transactions_updated_at'
  ) THEN
    CREATE TRIGGER update_cable_tv_transactions_updated_at
    BEFORE UPDATE ON public.cable_tv_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_cable_tv_transactions_user_id ON public.cable_tv_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cable_tv_transactions_status ON public.cable_tv_transactions(status);
CREATE INDEX IF NOT EXISTS idx_cable_tv_transactions_reference ON public.cable_tv_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_cable_tv_transactions_created_at ON public.cable_tv_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_cable_tv_transactions_provider ON public.cable_tv_transactions(provider);

-- Note: For new records going forward:
-- 1. Set purchase_amount = base purchase amount (e.g., 1000)
-- 2. Calculate charge_fee = purchase_amount * 0.02 (2% fee = 20)
-- 3. Set amount = purchase_amount + charge_fee (total = 1020)














