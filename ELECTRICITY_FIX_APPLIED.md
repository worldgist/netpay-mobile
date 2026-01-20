# FIXED: Electricity Transactions Not Showing

## Root Cause
The `vending_provider` column was missing from the `electricity_transactions` table.

## Error Message
```
column electricity_transactions.vending_provider does not exist
```

## Solution Applied

### 1. Created Database Migration
**File**: `supabase/migrations/20260115000000_add_vending_provider_to_electricity_transactions.sql`

This migration:
- ✅ Adds the `vending_provider` column to `electricity_transactions` table
- ✅ Creates an index for better query performance
- ✅ Sets 'ebills' as default for existing records without a vending_provider

### 2. Fixed Mobile App Query
**File**: `mobile/app/(tabs)/transactions.tsx`
- ✅ Query now includes `vending_provider` field
- ✅ Added debug logging to track query results

## How to Apply the Fix

### Step 1: Run the Migration
Copy and paste this SQL into your Supabase SQL Editor:

```sql
-- Add vending_provider column to electricity_transactions table if it doesn't exist
-- This tracks which service (ebills, mobilenig, etc) was used for the purchase

DO $$ 
BEGIN
  -- Check if vending_provider column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'electricity_transactions' 
    AND column_name = 'vending_provider'
  ) THEN
    -- Add the column
    ALTER TABLE public.electricity_transactions 
    ADD COLUMN vending_provider TEXT;
    
    -- Add a comment explaining the column
    COMMENT ON COLUMN public.electricity_transactions.vending_provider 
    IS 'The vending service used for the purchase (ebills, mobilenig, etc)';
    
    -- Create an index for better query performance
    CREATE INDEX IF NOT EXISTS idx_electricity_transactions_vending_provider 
    ON public.electricity_transactions(vending_provider);
    
    RAISE NOTICE 'Added vending_provider column to electricity_transactions table';
  ELSE
    RAISE NOTICE 'vending_provider column already exists in electricity_transactions table';
  END IF;
END $$;

-- Set default vending_provider for existing records without one
UPDATE public.electricity_transactions
SET vending_provider = 'ebills'
WHERE vending_provider IS NULL;
```

### Step 2: Verify the Fix
After running the migration, check that it worked:

```sql
-- 1. Verify column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'electricity_transactions' 
AND column_name = 'vending_provider';

-- 2. Check existing records
SELECT 
  id,
  provider,
  meter_number,
  amount,
  vending_provider,
  created_at
FROM electricity_transactions
ORDER BY created_at DESC
LIMIT 10;
```

### Step 3: Test the Mobile App
1. Restart the mobile app
2. Navigate to the Transactions tab
3. Check the console logs - you should now see:
   ```
   Electricity transactions query result: {
     success: true,
     error: null,
     count: X,
     data: [...]
   }
   ```

## Why This Happened

The backend purchase-electricity function was trying to insert `vending_provider` into the database, but the column didn't exist in the table schema. This caused a mismatch where:

1. ✅ Transactions were being created (basic columns)
2. ❌ `vending_provider` value was being ignored (column missing)
3. ❌ Mobile app couldn't query with `vending_provider` (column missing)

## Verification

After applying the migration:
- ✅ All future electricity purchases will have `vending_provider` set correctly
- ✅ All existing electricity transactions now have `vending_provider = 'ebills'`
- ✅ Mobile app can successfully query electricity transactions
- ✅ Transactions will appear in the Transactions tab

## Additional Notes

The `vending_provider` column is important because:
- It tracks which service (eBills, MobileNig, etc.) was used
- Helps with reporting and analytics
- Allows filtering transactions by provider
- Important for reconciliation and auditing
