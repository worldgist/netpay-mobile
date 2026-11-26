-- Create referral_settings table for managing referral rewards
CREATE TABLE public.referral_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_amount NUMERIC NOT NULL DEFAULT 100.00,
  referrer_reward NUMERIC NOT NULL DEFAULT 100.00,
  referred_reward NUMERIC NOT NULL DEFAULT 50.00,
  min_transaction_for_reward NUMERIC NOT NULL DEFAULT 500.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create referrals table
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),
  reward_amount NUMERIC DEFAULT 0,
  reward_paid BOOLEAN NOT NULL DEFAULT false,
  referrer_reward_paid BOOLEAN NOT NULL DEFAULT false,
  referred_email TEXT,
  referred_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON public.referrals(referred_id);
CREATE INDEX idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX idx_referrals_status ON public.referrals(status);

-- Enable RLS
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_settings
CREATE POLICY "Admins can view referral settings"
ON public.referral_settings FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update referral settings"
ON public.referral_settings FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert referral settings"
ON public.referral_settings FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- RLS Policies for referrals
CREATE POLICY "Admins can view all referrals"
ON public.referrals FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own referrals"
ON public.referrals FOR SELECT
USING (auth.uid() = referrer_id);

CREATE POLICY "Users can create their own referrals"
ON public.referrals FOR INSERT
WITH CHECK (auth.uid() = referrer_id);

CREATE POLICY "Admins can update referrals"
ON public.referrals FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete referrals"
ON public.referrals FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_referrals_updated_at
BEFORE UPDATE ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referral_settings_updated_at
BEFORE UPDATE ON public.referral_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default referral settings
INSERT INTO public.referral_settings (reward_amount, referrer_reward, referred_reward, min_transaction_for_reward, is_active)
VALUES (100.00, 100.00, 50.00, 500.00, true);

-- Enable realtime for referrals
ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals;