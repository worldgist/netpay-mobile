-- Fix notifications.sent_by foreign key to allow user deletion
-- This migration fixes the foreign key constraint that prevents user deletion

-- Drop the existing foreign key constraint (try common constraint names)
DO $$
BEGIN
  -- Try to drop the constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND constraint_name LIKE '%sent_by%'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_sent_by_fkey;
    -- Also try without the _fkey suffix
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_sent_by_fkey;
  END IF;
END $$;

-- Allow sent_by to be NULL (for deleted users) if it's currently NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'sent_by' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.notifications ALTER COLUMN sent_by DROP NOT NULL;
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
    AND tc.table_name = 'notifications' 
    AND tc.constraint_name = 'notifications_sent_by_fkey'
    AND rc.delete_rule = 'SET NULL'
  ) THEN
    ALTER TABLE public.notifications 
    ADD CONSTRAINT notifications_sent_by_fkey 
    FOREIGN KEY (sent_by) 
    REFERENCES auth.users(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Add comment explaining the change
COMMENT ON COLUMN public.notifications.sent_by IS 'User who sent the notification. NULL if the user has been deleted.';

