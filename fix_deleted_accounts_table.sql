-- Quick fix: Add status column to deleted_accounts table
-- Run this in Supabase SQL Editor if the column is missing

-- Add status column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'deleted_accounts' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE deleted_accounts 
    ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled'));
    
    -- Create index on status
    CREATE INDEX IF NOT EXISTS idx_deleted_accounts_status ON deleted_accounts(status);
    
    RAISE NOTICE 'Status column added successfully';
  ELSE
    RAISE NOTICE 'Status column already exists';
  END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'deleted_accounts'
ORDER BY ordinal_position;







