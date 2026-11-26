ALTER TABLE public.referral_settings
  ALTER COLUMN referred_reward SET DEFAULT 0.00;

UPDATE public.referral_settings
SET referred_reward = 0.00
WHERE referred_reward <> 0.00;
