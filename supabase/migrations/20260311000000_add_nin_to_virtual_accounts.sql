-- Store customer NIN used during virtual account creation
ALTER TABLE public.virtual_accounts
ADD COLUMN IF NOT EXISTS nin TEXT;

-- Keep data quality consistent for NIN values entered from mobile
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'virtual_accounts_nin_format_chk'
	) THEN
		ALTER TABLE public.virtual_accounts
		ADD CONSTRAINT virtual_accounts_nin_format_chk
		CHECK (nin IS NULL OR nin ~ '^[0-9]{11}$');
	END IF;
END $$;

COMMENT ON COLUMN public.virtual_accounts.nin IS 'Customer NIN used for static virtual account creation (11 digits).';
