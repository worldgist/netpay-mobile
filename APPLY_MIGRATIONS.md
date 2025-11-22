# How to Apply Education Vendor Migrations

## ✅ What's Been Done

1. ✅ Updated Education Services UI with vendor support (VTPASS select, vendor fields)
2. ✅ Created migration files in `supabase/migrations/`
3. ✅ Created combined SQL file: `apply_education_vendor_migrations.sql`

## 🚀 Apply Migrations - EASIEST METHOD

### Option 1: Supabase Dashboard (Recommended - Most Reliable)

1. Open your Supabase project: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac
2. Go to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Open the file: `apply_education_vendor_migrations.sql`
5. Copy **ALL** the contents (Cmd+A, Cmd+C)
6. Paste into the SQL Editor
7. Click **Run** (or press Cmd+Enter)

That's it! The migrations will be applied.

### Option 2: Supabase CLI (If working)

```bash
# For remote database
supabase db push

# For local database  
supabase start
supabase migration up
```

## 📋 What the Migrations Do

- ✅ Add `vending_provider` column
- ✅ Add vendor code columns: `vtpass_code`, `smeplug_code`, `mobilenig_code`
- ✅ Add `vendor_price` and `user_price` columns
- ✅ Ensure `service_id` column exists
- ✅ Migrate existing data to new structure
- ✅ Create indexes for performance
- ✅ Update unique constraints to support multiple vendors
- ✅ Add `education_provider` setting to `app_settings`

## ✨ After Applying

Your education_services table will have:
- Full vendor support (VTpass, SMEPlug, Mobilenig)
- Price tracking (vendor price vs user price)
- Provider filtering capability
- All matching the updated UI

## 🔒 Safety

The SQL is **idempotent** - safe to run multiple times. It uses `IF NOT EXISTS` and `ON CONFLICT DO NOTHING` patterns.

---

**Need help?** The SQL file is ready at: `apply_education_vendor_migrations.sql`

