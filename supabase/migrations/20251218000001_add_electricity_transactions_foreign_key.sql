-- Add foreign key constraint to electricity_transactions.user_id
-- This allows Supabase to recognize the relationship for joins

DO $$
BEGIN
  -- Check if foreign key constraint already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'electricity_transactions' 
    AND constraint_name = 'electricity_transactions_user_id_fkey'
  ) THEN
    -- Add foreign key constraint if it doesn't exist
    ALTER TABLE public.electricity_transactions
    ADD CONSTRAINT electricity_transactions_user_id_fkey
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add index on user_id for better query performance
CREATE INDEX IF NOT EXISTS idx_electricity_transactions_user_id 
ON public.electricity_transactions(user_id);

