-- Track which payment provider issued each virtual account
ALTER TABLE public.virtual_accounts
ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'payvessel';

UPDATE public.virtual_accounts
SET provider = 'payvessel'
WHERE provider IS NULL OR provider = '';

COMMENT ON COLUMN public.virtual_accounts.provider IS 'Funding provider: payvessel or flutterwave';

CREATE INDEX IF NOT EXISTS idx_virtual_accounts_user_provider
ON public.virtual_accounts(user_id, provider);
