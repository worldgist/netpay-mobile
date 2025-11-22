-- Verify the vendor system migration was applied successfully

-- Check vendors table exists
SELECT 
    'vendors' as table_name,
    COUNT(*) as row_count
FROM vendors;

-- Check vendor_priority table exists  
SELECT 
    'vendor_priority' as table_name,
    COUNT(*) as row_count
FROM vendor_priority;

-- Check new columns in data_plans
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'data_plans'
AND column_name IN ('plan_type', 'size', 'vendor_price', 'user_price', 
                    'vtpass_code', 'smeplug_code', 'mobilenig_code', 'is_active')
ORDER BY column_name;

-- Check default vendor priorities
SELECT network, plan_type, vendor_order
FROM vendor_priority
ORDER BY network, plan_type;

-- Sample data_plans with new columns
SELECT 
    id,
    network,
    plan_name,
    plan_type,
    size,
    vendor_price,
    user_price,
    vtpass_code,
    smeplug_code,
    mobilenig_code,
    is_active
FROM data_plans
LIMIT 5;

