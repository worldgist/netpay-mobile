-- Create airtime_transactions table
CREATE TABLE public.airtime_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  network TEXT NOT NULL,
  service_id TEXT NOT NULL,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT NOT NULL UNIQUE,
  api_response JSONB,
  performed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.airtime_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can view all airtime transactions"
ON public.airtime_transactions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own airtime transactions"
ON public.airtime_transactions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert airtime transactions"
ON public.airtime_transactions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert airtime transactions"
ON public.airtime_transactions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update airtime transactions"
ON public.airtime_transactions
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for better query performance
CREATE INDEX idx_airtime_transactions_user_id ON public.airtime_transactions(user_id);
CREATE INDEX idx_airtime_transactions_created_at ON public.airtime_transactions(created_at DESC);
CREATE INDEX idx_airtime_transactions_status ON public.airtime_transactions(status);

-- Create trigger for updated_at
CREATE TRIGGER update_airtime_transactions_updated_at
BEFORE UPDATE ON public.airtime_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();