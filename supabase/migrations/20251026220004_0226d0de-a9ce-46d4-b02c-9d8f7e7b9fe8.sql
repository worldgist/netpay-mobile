-- Add unique constraint to data_plans api_code column
ALTER TABLE public.data_plans 
ADD CONSTRAINT data_plans_api_code_key UNIQUE (api_code);