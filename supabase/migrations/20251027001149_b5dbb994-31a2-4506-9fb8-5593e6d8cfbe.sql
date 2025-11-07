-- Add unique constraint to prevent duplicate education services
ALTER TABLE public.education_services 
ADD CONSTRAINT education_services_exam_type_api_code_key 
UNIQUE (exam_type, api_code);