-- Create funding_transactions table
CREATE TABLE public.funding_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  api_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.funding_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own funding transactions
CREATE POLICY "Users can view their own funding transactions"
ON public.funding_transactions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all funding transactions
CREATE POLICY "Admins can view all funding transactions"
ON public.funding_transactions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert funding transactions
CREATE POLICY "System can insert funding transactions"
ON public.funding_transactions
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Admins can update funding transactions
CREATE POLICY "Admins can update funding transactions"
ON public.funding_transactions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_funding_transactions_updated_at
BEFORE UPDATE ON public.funding_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();