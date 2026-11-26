-- Add missing columns to data_plans table
-- These columns are used by the admin UI for importing and managing data plans

-- Add plan_type column (SME, GIFTING, etc.)
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS plan_type TEXT;

-- Add size column (e.g., "1GB", "500MB")
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS size TEXT;

-- Add vendor_price column (if it doesn't exist, use user_price as reference)
-- vendor_price is the price from the vendor, same as original_price typically
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS vendor_price NUMERIC(10,2);

-- Add comments for documentation
COMMENT ON COLUMN public.data_plans.plan_type IS 'Type of data plan: SME, GIFTING, etc.';
COMMENT ON COLUMN public.data_plans.size IS 'Data size (e.g., "1GB", "500MB")';
COMMENT ON COLUMN public.data_plans.vendor_price IS 'Price from the vendor (same as original_price)';


























