-- Add foreign key constraint to betting_transactions.user_id
-- This enables Supabase to automatically detect the relationship with profiles table

-- Check if foreign key already exists
DO $$
BEGIN
  -- Check if the foreign key constraint already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'betting_transactions' 
    AND constraint_name = 'betting_transactions_user_id_fkey'
  ) THEN
    -- Add foreign key constraint
    ALTER TABLE public.betting_transactions
    ADD CONSTRAINT betting_transactions_user_id_fkey
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Foreign key constraint added to betting_transactions.user_id';
  ELSE
    RAISE NOTICE 'Foreign key constraint already exists on betting_transactions.user_id';
  END IF;
END $$;

-- Add comment
COMMENT ON CONSTRAINT betting_transactions_user_id_fkey ON public.betting_transactions 
IS 'Foreign key relationship to profiles table, enabling automatic relationship detection in Supabase';






