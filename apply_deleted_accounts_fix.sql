-- Fix deleted_accounts.deleted_by foreign key to allow user deletion
-- Run this in Supabase Dashboard > SQL Editor

-- Drop the existing foreign key constraint
ALTER TABLE public.deleted_accounts 
  DROP CONSTRAINT IF EXISTS deleted_accounts_deleted_by_fkey;

-- Allow deleted_by to be NULL (for deleted users)
ALTER TABLE public.deleted_accounts 
  ALTER COLUMN deleted_by DROP NOT NULL;

-- Re-add the foreign key constraint with ON DELETE SET NULL
ALTER TABLE public.deleted_accounts 
  ADD CONSTRAINT deleted_accounts_deleted_by_fkey 
  FOREIGN KEY (deleted_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

-- Add comment explaining the change
COMMENT ON COLUMN public.deleted_accounts.deleted_by IS 'User who performed the deletion. NULL if the user has been deleted.';


