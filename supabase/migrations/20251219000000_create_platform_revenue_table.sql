-- Create platform_revenue table to track all platform revenue from charge fees
-- This table automatically records revenue when transactions are completed

-- Drop table if it exists and recreate (to ensure correct schema)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_revenue') THEN
    DROP TABLE public.platform_revenue CASCADE;
  END IF;
END $$;

CREATE TABLE public.platform_revenue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL, -- Reference to the transaction (education_transactions or electricity_transactions)
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('education', 'electricity', 'airtime', 'data', 'cable')),
  transaction_table TEXT NOT NULL, -- 'education_transactions' or 'electricity_transactions'
  revenue_amount NUMERIC NOT NULL, -- The charge fee amount (platform revenue)
  purchase_amount NUMERIC NOT NULL, -- Original purchase amount (before fee)
  charge_fee_rate NUMERIC NOT NULL, -- The fee rate used (0.07 for education, 0.10 for electricity)
  user_id UUID NOT NULL, -- User who made the transaction
  transaction_reference TEXT NOT NULL, -- Transaction reference for easy lookup
  transaction_status TEXT NOT NULL DEFAULT 'completed', -- Status of the transaction
  metadata JSONB, -- Additional metadata (exam_type, provider, etc.)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE public.platform_revenue IS 'Tracks platform revenue from charge fees on all transactions';
COMMENT ON COLUMN public.platform_revenue.revenue_amount IS 'The charge fee amount collected as platform revenue';
COMMENT ON COLUMN public.platform_revenue.purchase_amount IS 'The original purchase amount before fees';
COMMENT ON COLUMN public.platform_revenue.charge_fee_rate IS 'The fee rate applied (e.g., 0.07 for 7%, 0.10 for 10%)';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_platform_revenue_transaction_type ON public.platform_revenue(transaction_type);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_user_id ON public.platform_revenue(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_created_at ON public.platform_revenue(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_transaction_id ON public.platform_revenue(transaction_id);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_status ON public.platform_revenue(transaction_status);

-- Enable RLS
ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Only admins can view all revenue
CREATE POLICY "Admins can view all platform revenue"
ON public.platform_revenue
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert revenue records
CREATE POLICY "System can insert platform revenue"
ON public.platform_revenue
FOR INSERT
WITH CHECK (true);

-- Admins can update revenue records
CREATE POLICY "Admins can update platform revenue"
ON public.platform_revenue
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_platform_revenue_updated_at
BEFORE UPDATE ON public.platform_revenue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

