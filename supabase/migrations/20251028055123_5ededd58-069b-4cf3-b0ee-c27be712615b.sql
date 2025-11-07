-- Create transfer_transactions table
CREATE TABLE public.transfer_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  description TEXT,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  sender_balance_before NUMERIC NOT NULL,
  sender_balance_after NUMERIC NOT NULL,
  recipient_balance_before NUMERIC NOT NULL,
  recipient_balance_after NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.transfer_transactions ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX idx_transfer_sender ON public.transfer_transactions(sender_id);
CREATE INDEX idx_transfer_recipient ON public.transfer_transactions(recipient_id);
CREATE INDEX idx_transfer_reference ON public.transfer_transactions(reference);
CREATE INDEX idx_transfer_created_at ON public.transfer_transactions(created_at DESC);

-- RLS Policy: Users can view their own transfers (as sender or recipient)
CREATE POLICY "Users can view their own transfers"
ON public.transfer_transactions
FOR SELECT
TO authenticated
USING (
  auth.uid() = sender_id OR auth.uid() = recipient_id
);

-- RLS Policy: Admins can view all transfers
CREATE POLICY "Admins can view all transfers"
ON public.transfer_transactions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policy: System can insert transfers
CREATE POLICY "System can insert transfers"
ON public.transfer_transactions
FOR INSERT
TO authenticated
WITH CHECK (true);

-- RLS Policy: Admins can update transfers
CREATE POLICY "Admins can update transfers"
ON public.transfer_transactions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_transfer_transactions_updated_at
BEFORE UPDATE ON public.transfer_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
