-- Create table to store virtual account details
CREATE TABLE IF NOT EXISTS public.virtual_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  tracking_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, bank_code)
);

-- Enable RLS
ALTER TABLE public.virtual_accounts ENABLE ROW LEVEL SECURITY;

-- Users can view their own virtual accounts
CREATE POLICY "Users can view their own virtual accounts"
ON public.virtual_accounts
FOR SELECT
USING (auth.uid() = user_id);

-- System can insert virtual accounts
CREATE POLICY "System can insert virtual accounts"
ON public.virtual_accounts
FOR INSERT
WITH CHECK (true);

-- System can update virtual accounts
CREATE POLICY "System can update virtual accounts"
ON public.virtual_accounts
FOR UPDATE
USING (true);

-- Add index for faster lookups
CREATE INDEX idx_virtual_accounts_user_id ON public.virtual_accounts(user_id);
CREATE INDEX idx_virtual_accounts_account_number ON public.virtual_accounts(account_number);