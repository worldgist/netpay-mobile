-- Create electricity_transactions table
CREATE TABLE public.electricity_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
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

-- Enable RLS
ALTER TABLE public.electricity_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own electricity transactions"
ON public.electricity_transactions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all electricity transactions"
ON public.electricity_transactions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert electricity transactions"
ON public.electricity_transactions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update electricity transactions"
ON public.electricity_transactions
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_electricity_transactions_updated_at
BEFORE UPDATE ON public.electricity_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();