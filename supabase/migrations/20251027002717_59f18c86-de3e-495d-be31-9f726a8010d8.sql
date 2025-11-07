-- Add unique constraint to prevent duplicate airtime providers
ALTER TABLE public.airtime_providers 
ADD CONSTRAINT airtime_providers_api_code_key 
UNIQUE (api_code);