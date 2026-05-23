-- Store customer BVN used during virtual account creation
ALTER TABLE public.virtual_accounts
ADD COLUMN IF NOT EXISTS bvn TEXT;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'virtual_accounts_bvn_format_chk'
	) THEN
		ALTER TABLE public.virtual_accounts
		ADD CONSTRAINT virtual_accounts_bvn_format_chk
		CHECK (bvn IS NULL OR bvn ~ '^[0-9]{11}$');
	END IF;
END $$;

COMMENT ON COLUMN public.virtual_accounts.bvn IS 'Customer BVN used for static virtual account creation (11 digits).';
