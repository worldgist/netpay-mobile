-- Add VTpass and other vendor code columns to education_services table

-- Step 1: Add vending_provider column to track which vendor provides each service
ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS vending_provider TEXT;

-- Set default value for existing records (assuming they were from mobilenig based on service_id defaults)
UPDATE public.education_services 
SET vending_provider = 'mobilenig' 
WHERE vending_provider IS NULL;

-- Step 2: Add vendor code columns for each vendor
ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS vtpass_code TEXT;

ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS smeplug_code TEXT;

ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS mobilenig_code TEXT;

-- Step 3: Add vendor_price and user_price columns
ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS vendor_price NUMERIC(10,2);

ALTER TABLE public.education_services 
  ADD COLUMN IF NOT EXISTS user_price NUMERIC(10,2);

-- Step 4: Migrate existing data to new structure
-- Set vendor_price from original_price or price
UPDATE public.education_services 
SET vendor_price = COALESCE(original_price, price)
WHERE vendor_price IS NULL;

-- Set user_price from custom_price, original_price, or price
UPDATE public.education_services 
SET user_price = COALESCE(custom_price, original_price, price)
WHERE user_price IS NULL;

-- Migrate existing api_code to appropriate vendor code based on vending_provider
-- For existing services, set the vendor code based on their current provider
UPDATE public.education_services 
SET 
  mobilenig_code = CASE WHEN vending_provider = 'mobilenig' THEN api_code ELSE mobilenig_code END,
  smeplug_code = CASE WHEN vending_provider = 'smeplug' THEN api_code ELSE smeplug_code END,
  vtpass_code = CASE WHEN vending_provider = 'vtpass' THEN api_code ELSE vtpass_code END
WHERE (mobilenig_code IS NULL AND smeplug_code IS NULL AND vtpass_code IS NULL);

-- Step 5: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_education_services_vending_provider 
  ON public.education_services(vending_provider);

CREATE INDEX IF NOT EXISTS idx_education_services_exam_type_vending_provider 
  ON public.education_services(exam_type, vending_provider);

CREATE INDEX IF NOT EXISTS idx_education_services_is_active 
  ON public.education_services(is_active);

-- Step 6: Add comments for documentation
COMMENT ON COLUMN public.education_services.vending_provider IS 'Vending provider: smeplug, vtpass, mobilenig, ebills.africa, or anyone';
COMMENT ON COLUMN public.education_services.vtpass_code IS 'VTpass service code/variation code';
COMMENT ON COLUMN public.education_services.smeplug_code IS 'SMEPlug service code';
COMMENT ON COLUMN public.education_services.mobilenig_code IS 'Mobilenig service code';
COMMENT ON COLUMN public.education_services.vendor_price IS 'Price charged by vendor (cost price)';
COMMENT ON COLUMN public.education_services.user_price IS 'Price charged to user (selling price)';

