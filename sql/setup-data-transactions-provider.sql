-- Add provider column to data_transactions table
-- This migration adds provider tracking to data transactions

-- Step 1: Add the provider column (nullable initially)
ALTER TABLE public.data_transactions
ADD COLUMN IF NOT EXISTS provider TEXT;

-- Step 2: Set default value for existing rows (assuming they were smeplug)
UPDATE public.data_transactions
SET provider = 'smeplug'
WHERE provider IS NULL;

-- Step 3: Make provider NOT NULL with default value
ALTER TABLE public.data_transactions
ALTER COLUMN provider SET NOT NULL,
ALTER COLUMN provider SET DEFAULT 'smeplug';

-- Step 4: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_data_transactions_provider 
ON public.data_transactions(provider);

CREATE INDEX IF NOT EXISTS idx_data_transactions_user_provider 
ON public.data_transactions(user_id, provider);

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'data_transactions'
AND column_name = 'provider';

