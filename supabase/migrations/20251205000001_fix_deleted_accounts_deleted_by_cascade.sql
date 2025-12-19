-- Fix deleted_accounts.deleted_by foreign key to allow user deletion
-- This migration fixes the foreign key constraint that prevents user deletion

-- Drop the existing foreign key constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
    AND table_name = 'deleted_accounts' 
    AND constraint_name = 'deleted_accounts_deleted_by_fkey'
  ) THEN
    ALTER TABLE public.deleted_accounts 
    DROP CONSTRAINT deleted_accounts_deleted_by_fkey;
  END IF;
END $$;

-- Allow deleted_by to be NULL (for deleted users) if it's currently NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'deleted_accounts' 
    AND column_name = 'deleted_by' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.deleted_accounts 
    ALTER COLUMN deleted_by DROP NOT NULL;
  END IF;
END $$;

-- Re-add the foreign key constraint with ON DELETE SET NULL
-- Only add if it doesn't already exist with the correct ON DELETE behavior
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'deleted_accounts' 
    AND tc.constraint_name = 'deleted_accounts_deleted_by_fkey'
    AND rc.delete_rule = 'SET NULL'
  ) THEN
    ALTER TABLE public.deleted_accounts 
    ADD CONSTRAINT deleted_accounts_deleted_by_fkey 
    FOREIGN KEY (deleted_by) 
    REFERENCES auth.users(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Add comment explaining the change
COMMENT ON COLUMN public.deleted_accounts.deleted_by IS 'User who performed the deletion. NULL if the user has been deleted.';
















