-- Add vending_provider column to betting_transactions table
ALTER TABLE public.betting_transactions
ADD COLUMN IF NOT EXISTS vending_provider TEXT DEFAULT 'vtpass';

-- Update existing records to have vending_provider
UPDATE public.betting_transactions
SET vending_provider = 'vtpass'
WHERE vending_provider IS NULL;

-- Add comment
COMMENT ON COLUMN public.betting_transactions.vending_provider IS 'Vending provider used for this transaction: vtpass, mobilenig, smeplug, or ebills';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_betting_transactions_vending_provider ON public.betting_transactions(vending_provider);






