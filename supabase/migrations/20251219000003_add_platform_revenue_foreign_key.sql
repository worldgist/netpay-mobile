-- Add foreign key constraint to platform_revenue.user_id
-- This allows Supabase to recognize the relationship for joins

DO $$
BEGIN
  -- Check if foreign key constraint already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND table_name = 'platform_revenue' 
    AND constraint_name = 'platform_revenue_user_id_fkey'
  ) THEN
    -- Add foreign key constraint if it doesn't exist
    ALTER TABLE public.platform_revenue
    ADD CONSTRAINT platform_revenue_user_id_fkey
    FOREIGN KEY (user_id) 
    REFERENCES public.profiles(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add index on user_id for better query performance
CREATE INDEX IF NOT EXISTS idx_platform_revenue_user_id 
ON public.platform_revenue(user_id);















