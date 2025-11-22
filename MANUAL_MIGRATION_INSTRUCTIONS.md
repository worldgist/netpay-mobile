# Manual Migration Instructions

## Apply Migration via Supabase Dashboard

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/sql/new

2. **Copy the migration SQL**
   - Open: `supabase/migrations/20251202000000_create_vendors_system.sql`
   - Copy all contents

3. **Paste and Run**
   - Paste the SQL into the SQL editor
   - Click "Run" to execute
   - Verify all statements execute successfully

## Migration Contents Summary

The migration will:
- ✅ Create `vendors` table
- ✅ Create `vendor_priority` table  
- ✅ Add new columns to `data_plans` table:
  - `plan_type`, `size`, `vendor_price`, `user_price`
  - `vtpass_code`, `smeplug_code`, `mobilenig_code`
  - `is_active`
- ✅ Migrate existing data to new structure
- ✅ Set up RLS policies
- ✅ Create indexes and triggers
- ✅ Add default vendor priorities

## After Migration

1. **Verify Tables Created**
   ```sql
   SELECT * FROM vendors;
   SELECT * FROM vendor_priority LIMIT 5;
   SELECT plan_type, size, vendor_price, user_price FROM data_plans LIMIT 5;
   ```

2. **Configure Vendors**
   - Go to admin panel `/vendors`
   - Add API keys and secrets for each vendor

3. **Set Vendor Priorities**
   - Go to admin panel `/vendor-priority`
   - Configure fallback order for each network/plan_type

4. **Update Data Plans**
   - Go to admin panel `/data-plans`
   - Edit plans to add vendor codes

## Deploy Functions

After migration, deploy the new function:
```bash
supabase functions deploy purchase-data --no-verify-jwt
supabase functions deploy smeplug-webhook --no-verify-jwt
```

Or use the deployment script:
```bash
./deploy-all-functions.sh
```

