-- Fix notifications.sent_by foreign key to allow user deletion
-- Run this in Supabase Dashboard > SQL Editor

-- Drop the existing foreign key constraint
ALTER TABLE public.notifications 
  DROP CONSTRAINT IF EXISTS notifications_sent_by_fkey;

-- Allow sent_by to be NULL (for deleted users)
ALTER TABLE public.notifications 
  ALTER COLUMN sent_by DROP NOT NULL;

-- Re-add the foreign key constraint with ON DELETE SET NULL
ALTER TABLE public.notifications 
  ADD CONSTRAINT notifications_sent_by_fkey 
  FOREIGN KEY (sent_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

-- Add comment explaining the change
COMMENT ON COLUMN public.notifications.sent_by IS 'User who sent the notification. NULL if the user has been deleted.';


