-- Add original_price and custom_price columns to education_services table
ALTER TABLE public.education_services
ADD COLUMN IF NOT EXISTS original_price numeric,
ADD COLUMN IF NOT EXISTS custom_price numeric;

-- Update existing records to set original_price from price
UPDATE public.education_services
SET original_price = price
WHERE original_price IS NULL;

-- Create function to get effective price for education services
CREATE OR REPLACE FUNCTION public.get_education_service_effective_price(service_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(custom_price, original_price, price)
  FROM public.education_services
  WHERE id = service_id;
$$;

-- Create function to reset custom prices for education services
CREATE OR REPLACE FUNCTION public.reset_education_service_custom_price(service_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.education_services
  SET custom_price = NULL,
      updated_at = now()
  WHERE id = service_id;
$$;