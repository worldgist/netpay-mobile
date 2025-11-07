-- Create data_transactions table
CREATE TABLE public.data_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  balance_before numeric NOT NULL,
  balance_after numeric NOT NULL,
  phone_number text NOT NULL,
  network text NOT NULL,
  plan_name text NOT NULL,
  plan_validity text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reference text NOT NULL,
  api_response jsonb,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.data_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own data transactions"
ON public.data_transactions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all data transactions"
ON public.data_transactions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert data transactions"
ON public.data_transactions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can insert data transactions"
ON public.data_transactions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update data transactions"
ON public.data_transactions
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_data_transactions_updated_at
BEFORE UPDATE ON public.data_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();