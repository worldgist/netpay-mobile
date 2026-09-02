-- Tag airtime, data, and cable TV purchases with the vending API that fulfilled them.
-- Electricity and betting already have vending_provider.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'airtime_transactions'
      AND column_name = 'vending_provider'
  ) THEN
    ALTER TABLE public.airtime_transactions
      ADD COLUMN vending_provider TEXT;
    COMMENT ON COLUMN public.airtime_transactions.vending_provider
      IS 'Vending API used for this purchase (ebills, smeplug, mobilenig, flutterwave)';
    CREATE INDEX IF NOT EXISTS idx_airtime_transactions_vending_provider
      ON public.airtime_transactions(vending_provider);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'data_transactions'
      AND column_name = 'vending_provider'
  ) THEN
    ALTER TABLE public.data_transactions
      ADD COLUMN vending_provider TEXT;
    COMMENT ON COLUMN public.data_transactions.vending_provider
      IS 'Vending API used for this purchase (ebills, smeplug, mobilenig, flutterwave)';
    CREATE INDEX IF NOT EXISTS idx_data_transactions_vending_provider
      ON public.data_transactions(vending_provider);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cable_tv_transactions'
      AND column_name = 'vending_provider'
  ) THEN
    ALTER TABLE public.cable_tv_transactions
      ADD COLUMN vending_provider TEXT;
    COMMENT ON COLUMN public.cable_tv_transactions.vending_provider
      IS 'Vending API used for this purchase (ebills, mobilenig, flutterwave)';
    CREATE INDEX IF NOT EXISTS idx_cable_tv_transactions_vending_provider
      ON public.cable_tv_transactions(vending_provider);
  END IF;
END $$;

-- Backfill eBills rows that were stored without a vendor tag.
UPDATE public.airtime_transactions
SET vending_provider = 'ebills'
WHERE vending_provider IS NULL
  AND (
    reference ILIKE 'req_%'
    OR reference ILIKE '%EBILLS%'
    OR COALESCE(api_response::text, '') ILIKE '%ebills.africa%'
  );

UPDATE public.data_transactions
SET vending_provider = 'ebills'
WHERE vending_provider IS NULL
  AND (
    reference ILIKE 'req_%'
    OR reference ILIKE '%EBILLS%'
    OR COALESCE(api_response::text, '') ILIKE '%ebills.africa%'
    OR provider = 'ebills'
  );

UPDATE public.cable_tv_transactions
SET vending_provider = 'ebills'
WHERE vending_provider IS NULL
  AND (
    reference ILIKE '%EBILLS%'
    OR reference ILIKE 'req_%'
    OR COALESCE(api_response::text, '') ILIKE '%ebills.africa%'
  );
