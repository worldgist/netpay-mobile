CREATE TABLE IF NOT EXISTS public.vendors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  api_key TEXT,
  secret TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default vendors
INSERT INTO public.vendors (id, name, base_url, status) VALUES
  (1, 'vtpass', 'https://vtpass.com/api/', 'active'),
  (2, 'smeplug', 'https://api.smeplug.ng/v1/', 'active'),
  (3, 'mobilenig', 'https://enterprise.mobilenig.com/api/', 'active')
ON CONFLICT (name) DO NOTHING;

-- Set sequence to continue from 3
SELECT setval('vendors_id_seq', GREATEST(3, (SELECT MAX(id) FROM public.vendors)), true);

-- Step 2: Create data_plans table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.data_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  validity TEXT NOT NULL,
  api_code TEXT NOT NULL,
  provider TEXT DEFAULT 'smeplug',
  original_price NUMERIC(10,2),
  custom_price NUMERIC(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on data_plans if not already enabled
ALTER TABLE public.data_plans ENABLE ROW LEVEL SECURITY;

-- Step 3: Add new columns to data_plans table for vendor codes and plan details
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS plan_type TEXT;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS vendor_price NUMERIC;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS user_price NUMERIC;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS vtpass_code TEXT;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS smeplug_code TEXT;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS mobilenig_code TEXT;
ALTER TABLE public.data_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

-- Set default value for is_active column
UPDATE public.data_plans SET is_active = true WHERE is_active IS NULL;
ALTER TABLE public.data_plans ALTER COLUMN is_active SET DEFAULT true;

-- Migrate existing data to new structure
-- Set plan_type default to 'SME' for existing plans
UPDATE public.data_plans 
SET plan_type = 'SME' 
WHERE plan_type IS NULL;

-- Extract size from plan_name if possible (e.g., "1GB", "2GB")
UPDATE public.data_plans 
SET size = CASE 
  WHEN plan_name ~* '\d+\s*GB' THEN regexp_replace(plan_name, '.*?(\d+\s*GB).*', '\1', 'i')
  WHEN plan_name ~* '\d+\s*MB' THEN regexp_replace(plan_name, '.*?(\d+\s*MB).*', '\1', 'i')
  ELSE NULL
END WHERE size IS NULL;

-- Migrate pricing: original_price becomes vendor_price, custom_price/price becomes user_price
UPDATE public.data_plans 
SET vendor_price = COALESCE(original_price, price),
    user_price = COALESCE(custom_price, original_price, price)
WHERE vendor_price IS NULL;

-- Migrate API codes based on current provider
UPDATE public.data_plans 
SET 
  vtpass_code = CASE WHEN provider = 'vtpass' THEN api_code ELSE NULL END,
  smeplug_code = CASE WHEN provider = 'smeplug' THEN api_code ELSE NULL END,
  mobilenig_code = CASE WHEN provider = 'mobilenig' THEN api_code ELSE NULL END
WHERE vtpass_code IS NULL AND smeplug_code IS NULL AND mobilenig_code IS NULL;

-- Step 3: Create vendor_priority table for fallback logic
CREATE TABLE IF NOT EXISTS public.vendor_priority (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  vendor_order TEXT[] NOT NULL, -- Array of vendor names in priority order, e.g., ['vtpass', 'smeplug', 'mobilenig']
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(network, plan_type)
);

-- Insert default vendor priorities
INSERT INTO public.vendor_priority (network, plan_type, vendor_order) VALUES
  ('MTN', 'SME', ARRAY['vtpass', 'smeplug', 'mobilenig']),
  ('MTN', 'Gifting', ARRAY['smeplug', 'vtpass', 'mobilenig']),
  ('AIRTEL', 'SME', ARRAY['vtpass', 'smeplug', 'mobilenig']),
  ('AIRTEL', 'Gifting', ARRAY['smeplug', 'vtpass', 'mobilenig']),
  ('GLO', 'VTU', ARRAY['mobilenig', 'vtpass', 'smeplug']),
  ('GLO', 'SME', ARRAY['vtpass', 'smeplug', 'mobilenig']),
  ('9MOBILE', 'SME', ARRAY['vtpass', 'smeplug', 'mobilenig']),
  ('9MOBILE', 'Gifting', ARRAY['smeplug', 'vtpass', 'mobilenig'])
ON CONFLICT (network, plan_type) DO NOTHING;

-- Step 4: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors(status);
CREATE INDEX IF NOT EXISTS idx_data_plans_network_plan_type ON public.data_plans(network, plan_type);
CREATE INDEX IF NOT EXISTS idx_data_plans_is_active ON public.data_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_vendor_priority_network_plan_type ON public.vendor_priority(network, plan_type);

-- Step 5: Enable RLS on new tables
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_priority ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for vendors table
CREATE POLICY "Admins can view all vendors"
ON public.vendors FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage vendors"
ON public.vendors FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Step 7: Create RLS policies for vendor_priority table
CREATE POLICY "Admins can view all vendor priorities"
ON public.vendor_priority FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage vendor priorities"
ON public.vendor_priority FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Step 8: Update RLS policies for data_plans to allow users to view active plans
DROP POLICY IF EXISTS "Users can view active data plans" ON public.data_plans;
CREATE POLICY "Users can view active data plans"
ON public.data_plans FOR SELECT
TO authenticated
USING (is_active = true);

-- Step 9: Create trigger for updated_at on new tables
CREATE TRIGGER update_vendors_updated_at
BEFORE UPDATE ON public.vendors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_priority_updated_at
BEFORE UPDATE ON public.vendor_priority
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Step 10: Add comments for documentation
COMMENT ON TABLE public.vendors IS 'Data vending vendors (VTpass, SMEPlug, Mobilenig)';
COMMENT ON TABLE public.vendor_priority IS 'Vendor fallback priority order for each network and plan type';
COMMENT ON COLUMN public.vendor_priority.vendor_order IS 'Array of vendor names in priority order for fallback';
COMMENT ON COLUMN public.data_plans.plan_type IS 'Plan type: SME, Gifting, VTU, etc.';
COMMENT ON COLUMN public.data_plans.size IS 'Data size: e.g., 1GB, 2GB, 500MB';
COMMENT ON COLUMN public.data_plans.vendor_price IS 'Price charged by vendor (cost price)';
COMMENT ON COLUMN public.data_plans.user_price IS 'Price charged to user (selling price)';
COMMENT ON COLUMN public.data_plans.vtpass_code IS 'VTpass variation code';
COMMENT ON COLUMN public.data_plans.smeplug_code IS 'SMEPlug plan code';
COMMENT ON COLUMN public.data_plans.mobilenig_code IS 'Mobilenig plan code';

