-- Fix migration: Add status column if it doesn't exist
DO $$ 
BEGIN
  -- Check if status column exists, if not add it
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'deleted_accounts' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE deleted_accounts 
    ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled'));
    
    -- Create index on status if it doesn't exist
    CREATE INDEX IF NOT EXISTS idx_deleted_accounts_status ON deleted_accounts(status);
  END IF;
END $$;

-- Ensure all other columns exist
DO $$ 
BEGIN
  -- Add requested_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'deleted_accounts' AND column_name = 'requested_at'
  ) THEN
    ALTER TABLE deleted_accounts ADD COLUMN requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  
  -- Add deleted_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'deleted_accounts' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE deleted_accounts ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
  
  -- Add deletion_reason if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'deleted_accounts' AND column_name = 'deletion_reason'
  ) THEN
    ALTER TABLE deleted_accounts ADD COLUMN deletion_reason TEXT;
  END IF;
  
  -- Add metadata if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'deleted_accounts' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE deleted_accounts ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
  
  -- Add updated_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'deleted_accounts' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE deleted_accounts ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;






























