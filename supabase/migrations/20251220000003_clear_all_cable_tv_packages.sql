-- Clear all cable TV packages while keeping table structure and vending_provider column
-- This allows re-importing packages from API using the admin cable TV management function

-- Delete all rows from cable_tv_plans table if it exists
-- This preserves the table structure, columns, indexes, and constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'cable_tv_plans'
  ) THEN
    DELETE FROM public.cable_tv_plans;
    RAISE NOTICE 'Deleted all cable TV packages. Table structure and vending_provider column preserved.';
  ELSE
    RAISE NOTICE 'Table cable_tv_plans does not exist. Skipping deletion.';
  END IF;
END $$;

-- Note: The vending_provider column and all other columns remain intact
-- The admin can now use the "Fetch from API" function to re-import packages
-- with the correct vending_provider values

