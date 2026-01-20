-- Add vending_provider column to electricity_transactions table if it doesn't exist
-- This tracks which service (ebills, mobilenig, etc) was used for the purchase

DO $$ 
BEGIN
  -- Check if vending_provider column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'electricity_transactions' 
    AND column_name = 'vending_provider'
  ) THEN
    -- Add the column
    ALTER TABLE public.electricity_transactions 
    ADD COLUMN vending_provider TEXT;
    
    -- Add a comment explaining the column
    COMMENT ON COLUMN public.electricity_transactions.vending_provider 
    IS 'The vending service used for the purchase (ebills, mobilenig, etc)';
    
    -- Create an index for better query performance
    CREATE INDEX IF NOT EXISTS idx_electricity_transactions_vending_provider 
    ON public.electricity_transactions(vending_provider);
    
    RAISE NOTICE 'Added vending_provider column to electricity_transactions table';
  ELSE
    RAISE NOTICE 'vending_provider column already exists in electricity_transactions table';
  END IF;
END $$;

-- Set default vending_provider for existing records without one
UPDATE public.electricity_transactions
SET vending_provider = 'ebills'
WHERE vending_provider IS NULL;
