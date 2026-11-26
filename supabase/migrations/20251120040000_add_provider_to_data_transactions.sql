-- Add provider column to data_transactions table
ALTER TABLE public.data_transactions
ADD COLUMN provider TEXT;

-- Set default value for existing rows (assuming they were smeplug)
UPDATE public.data_transactions
SET provider = 'smeplug'
WHERE provider IS NULL;

-- Make provider NOT NULL with default
ALTER TABLE public.data_transactions
ALTER COLUMN provider SET NOT NULL,
ALTER COLUMN provider SET DEFAULT 'smeplug';

-- Add index for better query performance
CREATE INDEX idx_data_transactions_provider ON public.data_transactions(provider);

-- Add index for provider and user_id combination
CREATE INDEX idx_data_transactions_user_provider ON public.data_transactions(user_id, provider);

