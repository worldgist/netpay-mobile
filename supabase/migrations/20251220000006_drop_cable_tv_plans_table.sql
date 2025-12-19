-- Drop cable_tv_plans table if it exists
-- This removes the table and all its data

DROP TABLE IF EXISTS public.cable_tv_plans CASCADE;

-- Note: CASCADE will also drop:
-- - All dependent objects (indexes, triggers, policies, etc.)
-- - Foreign key constraints that reference this table
-- - Any views or functions that depend on this table


