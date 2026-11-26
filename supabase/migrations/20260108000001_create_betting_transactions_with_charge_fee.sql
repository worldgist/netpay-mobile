-- Create betting_transactions table if it doesn't exist (with charge_fee support)
CREATE TABLE IF NOT EXISTS public.betting_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  purchase_amount NUMERIC,
  charge_fee NUMERIC DEFAULT 0,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  betting_provider TEXT NOT NULL,
  account_number TEXT,
  phone_number TEXT,
  bet_type TEXT,
  game_type TEXT,
  ticket_number TEXT,
  api_response JSONB,
  metadata JSONB,
  performed_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add charge_fee and purchase_amount columns if table exists but columns don't (for existing tables)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'betting_transactions') THEN
    ALTER TABLE public.betting_transactions
      ADD COLUMN IF NOT EXISTS charge_fee NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS purchase_amount NUMERIC;
  END IF;
END $$;

-- Add comments to document the fee structure
COMMENT ON COLUMN public.betting_transactions.charge_fee IS 'Charge fee on betting transactions (percentage varies by provider)';
COMMENT ON COLUMN public.betting_transactions.purchase_amount IS 'Original purchase amount before fees (amount charged to user = purchase_amount + charge_fee)';
COMMENT ON COLUMN public.betting_transactions.amount IS 'Total amount charged to user (purchase_amount + charge_fee)';
COMMENT ON COLUMN public.betting_transactions.betting_provider IS 'Betting provider name (e.g., bet9ja, sportybet, nairabet, etc.)';
COMMENT ON COLUMN public.betting_transactions.account_number IS 'Betting account number or username';
COMMENT ON COLUMN public.betting_transactions.bet_type IS 'Type of bet (e.g., single, multiple, system)';
COMMENT ON COLUMN public.betting_transactions.game_type IS 'Game type (e.g., sports, virtual, casino)';
COMMENT ON COLUMN public.betting_transactions.ticket_number IS 'Betting ticket/reference number from provider';

-- For existing records, set purchase_amount to current amount and charge_fee to 0
-- (Existing records won't have the fee applied retroactively)
UPDATE public.betting_transactions
SET 
  purchase_amount = amount,
  charge_fee = 0
WHERE purchase_amount IS NULL;

-- Enable RLS if table exists (will be a no-op if already enabled)
ALTER TABLE public.betting_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies if they don't exist
DO $$
BEGIN
  -- Policy: Users can view their own betting transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'betting_transactions' 
    AND policyname = 'Users can view their own betting transactions'
  ) THEN
    CREATE POLICY "Users can view their own betting transactions"
    ON public.betting_transactions
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  -- Policy: Admins can view all betting transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'betting_transactions' 
    AND policyname = 'Admins can view all betting transactions'
  ) THEN
    CREATE POLICY "Admins can view all betting transactions"
    ON public.betting_transactions
    FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;

  -- Policy: System can insert betting transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'betting_transactions' 
    AND policyname = 'System can insert betting transactions'
  ) THEN
    CREATE POLICY "System can insert betting transactions"
    ON public.betting_transactions
    FOR INSERT
    WITH CHECK (true);
  END IF;

  -- Policy: Admins can update betting transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'betting_transactions' 
    AND policyname = 'Admins can update betting transactions'
  ) THEN
    CREATE POLICY "Admins can update betting transactions"
    ON public.betting_transactions
    FOR UPDATE
    USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- Create updated_at trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_betting_transactions_updated_at'
  ) THEN
    CREATE TRIGGER update_betting_transactions_updated_at
    BEFORE UPDATE ON public.betting_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_betting_transactions_user_id ON public.betting_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_betting_transactions_status ON public.betting_transactions(status);
CREATE INDEX IF NOT EXISTS idx_betting_transactions_reference ON public.betting_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_betting_transactions_created_at ON public.betting_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_betting_transactions_provider ON public.betting_transactions(betting_provider);
CREATE INDEX IF NOT EXISTS idx_betting_transactions_account_number ON public.betting_transactions(account_number);

-- Note: For new records going forward:
-- 1. Set purchase_amount = base purchase amount (e.g., 1000)
-- 2. Calculate charge_fee = purchase_amount * fee_rate (fee rate varies by provider)
-- 3. Set amount = purchase_amount + charge_fee (total charged to user)






