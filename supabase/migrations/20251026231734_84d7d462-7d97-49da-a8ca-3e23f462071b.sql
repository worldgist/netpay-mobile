-- Add unique constraint on api_code for cable_tv_plans
ALTER TABLE public.cable_tv_plans
ADD CONSTRAINT cable_tv_plans_api_code_key UNIQUE (api_code);