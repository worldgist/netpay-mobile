-- Dedicated NIN storage per user (used for Flutterwave virtual account creation)
CREATE TABLE IF NOT EXISTS public.user_nin (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nin TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'flutterwave',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_nin_format_chk CHECK (nin ~ '^[0-9]{11}$')
);

COMMENT ON TABLE public.user_nin IS 'Stores each user''s verified 11-digit NIN for wallet funding identity checks.';
COMMENT ON COLUMN public.user_nin.nin IS 'National Identity Number (11 digits).';
COMMENT ON COLUMN public.user_nin.provider IS 'Identity verification provider (e.g. flutterwave).';

CREATE INDEX IF NOT EXISTS idx_user_nin_user_id ON public.user_nin(user_id);

ALTER TABLE public.user_nin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own NIN"
ON public.user_nin
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own NIN"
ON public.user_nin
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own NIN"
ON public.user_nin
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all NIN records"
ON public.user_nin
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Service role / edge functions bypass RLS

-- Backfill from virtual_accounts where NIN was previously stored
INSERT INTO public.user_nin (user_id, nin, provider, verified_at, created_at, updated_at)
SELECT
  va.user_id,
  va.nin,
  COALESCE(va.provider, 'flutterwave'),
  va.updated_at,
  va.created_at,
  va.updated_at
FROM public.virtual_accounts va
WHERE va.nin IS NOT NULL
  AND va.nin ~ '^[0-9]{11}$'
ON CONFLICT (user_id) DO NOTHING;
