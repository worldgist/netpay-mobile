-- Add PIN/token columns to education_transactions table
-- This stores the PIN/token for WAEC, NECO, and JAMB result checker purchases

-- Add pin columns if they don't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'education_transactions') THEN
    ALTER TABLE public.education_transactions
      ADD COLUMN IF NOT EXISTS pin TEXT,
      ADD COLUMN IF NOT EXISTS serial_number TEXT,
      ADD COLUMN IF NOT EXISTS pins JSONB; -- For storing array of pins (for JAMB which can have multiple)
  END IF;
END $$;

-- Add comments to document the PIN structure
COMMENT ON COLUMN public.education_transactions.pin IS 'Single PIN/token for WAEC, NECO purchases (for backward compatibility)';
COMMENT ON COLUMN public.education_transactions.serial_number IS 'Serial number associated with the PIN';
COMMENT ON COLUMN public.education_transactions.pins IS 'Array of PIN objects for purchases that return multiple PINs (e.g., JAMB). Format: [{"Pin": "...", "Serial": "..."}]';



