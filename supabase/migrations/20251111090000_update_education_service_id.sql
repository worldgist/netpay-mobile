-- Add service_id column and migrate existing education services to Mobilenig service ids
ALTER TABLE public.education_services
ADD COLUMN IF NOT EXISTS service_id TEXT;

-- Populate service_id for known exam types
UPDATE public.education_services
SET service_id = CASE
  WHEN upper(exam_type) = 'WAEC' THEN 'AJA'
  WHEN upper(exam_type) = 'NECO' THEN 'AJC'
  WHEN upper(exam_type) = 'JAMB' THEN 'AJB'
  ELSE service_id
END
WHERE service_id IS NULL;

-- Fallback to existing API code if still missing
UPDATE public.education_services
SET service_id = api_code
WHERE service_id IS NULL
  AND api_code IS NOT NULL;

-- Final fallback to row id text
UPDATE public.education_services
SET service_id = id::text
WHERE service_id IS NULL;

-- Ensure service_id is required going forward
ALTER TABLE public.education_services
ALTER COLUMN service_id SET NOT NULL;

-- Replace unique constraint to use service_id instead of api_code
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'education_services_exam_type_api_code_key'
  ) THEN
    ALTER TABLE public.education_services
    DROP CONSTRAINT education_services_exam_type_api_code_key;
  END IF;
END $$;

ALTER TABLE public.education_services
ADD CONSTRAINT education_services_exam_type_service_id_key
UNIQUE (exam_type, service_id);

