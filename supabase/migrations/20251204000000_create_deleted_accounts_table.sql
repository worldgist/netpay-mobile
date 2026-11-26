-- Create deleted_accounts table to track account deletion requests
CREATE TABLE IF NOT EXISTS deleted_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT,
  phone TEXT,
  full_name TEXT,
  deletion_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on user_id for quick lookups
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_user_id ON deleted_accounts(user_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_status ON deleted_accounts(status);

-- Create index on requested_at for sorting
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_requested_at ON deleted_accounts(requested_at DESC);

-- Enable RLS
ALTER TABLE deleted_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view all deleted accounts
DROP POLICY IF EXISTS "Admins can view all deleted accounts" ON deleted_accounts;
CREATE POLICY "Admins can view all deleted accounts"
  ON deleted_accounts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Policy: Users can view their own deletion requests
DROP POLICY IF EXISTS "Users can view their own deletion requests" ON deleted_accounts;
CREATE POLICY "Users can view their own deletion requests"
  ON deleted_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Users can insert their own deletion requests
DROP POLICY IF EXISTS "Users can create their own deletion requests" ON deleted_accounts;
CREATE POLICY "Users can create their own deletion requests"
  ON deleted_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Only admins can update deletion records
DROP POLICY IF EXISTS "Admins can update deletion records" ON deleted_accounts;
CREATE POLICY "Admins can update deletion records"
  ON deleted_accounts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_deleted_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_deleted_accounts_updated_at ON deleted_accounts;
CREATE TRIGGER update_deleted_accounts_updated_at
  BEFORE UPDATE ON deleted_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_deleted_accounts_updated_at();

-- Function to automatically populate user details when creating a deletion request
CREATE OR REPLACE FUNCTION populate_deleted_account_user_details()
RETURNS TRIGGER AS $$
BEGIN
  -- Populate user details from profiles table if not provided
  IF NEW.email IS NULL OR NEW.full_name IS NULL THEN
    SELECT p.email, p.full_name, p.phone
    INTO NEW.email, NEW.full_name, NEW.phone
    FROM profiles p
    WHERE p.id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to populate user details
DROP TRIGGER IF EXISTS populate_deleted_account_user_details ON deleted_accounts;
CREATE TRIGGER populate_deleted_account_user_details
  BEFORE INSERT ON deleted_accounts
  FOR EACH ROW
  EXECUTE FUNCTION populate_deleted_account_user_details();

-- Add comment to table
COMMENT ON TABLE deleted_accounts IS 'Tracks account deletion requests and completed deletions';
COMMENT ON COLUMN deleted_accounts.status IS 'Status of deletion: pending, processing, completed, or cancelled';
COMMENT ON COLUMN deleted_accounts.deletion_reason IS 'Reason provided by user for account deletion';
COMMENT ON COLUMN deleted_accounts.metadata IS 'Additional metadata about the deletion (e.g., IP address, user agent, etc.)';





