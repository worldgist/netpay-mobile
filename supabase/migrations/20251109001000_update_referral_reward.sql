ALTER TABLE public.referral_settings
  ALTER COLUMN referrer_reward SET DEFAULT 200.00,
  ALTER COLUMN reward_amount SET DEFAULT 200.00;

UPDATE public.referral_settings
SET
  referrer_reward = 200.00,
  reward_amount = 200.00
WHERE referrer_reward <> 200.00 OR reward_amount <> 200.00;
