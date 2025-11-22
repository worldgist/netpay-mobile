# Deployment Checklist

## ✅ Migration Applied
- [ ] Run SQL from `supabase/migrations/20251202000000_create_vendors_system.sql` in Supabase Dashboard
- [ ] Verify `vendors` table created
- [ ] Verify `vendor_priority` table created  
- [ ] Verify new columns added to `data_plans`
- [ ] Check that existing data was migrated correctly

## ✅ Functions Deployed
- [ ] `supabase functions deploy purchase-data --no-verify-jwt`
- [ ] `supabase functions deploy smeplug-webhook --no-verify-jwt`

## ✅ Configuration Updated
- [ ] Config file updated with new functions
- [ ] Function secrets configured (API keys for vendors)

## ✅ Admin Setup
- [ ] Configure vendor credentials at `/vendors`
- [ ] Set vendor priorities at `/vendor-priority`
- [ ] Update data plans with vendor codes at `/data-plans`

## ✅ Testing
- [ ] Test purchase flow with unified endpoint
- [ ] Verify fallback logic works
- [ ] Test webhook handlers
- [ ] Verify pending transactions update correctly

## Quick Verification Queries

```sql
-- Check vendors table
SELECT * FROM vendors;

-- Check vendor priorities
SELECT * FROM vendor_priority;

-- Check data plans have new columns
SELECT id, network, plan_type, size, vendor_price, user_price, 
       vtpass_code, smeplug_code, mobilenig_code, is_active 
FROM data_plans LIMIT 5;
```

