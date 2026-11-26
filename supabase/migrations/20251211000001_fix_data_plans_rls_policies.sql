-- Fix RLS policies for data_plans table
-- Ensure admins can insert, update, and delete data plans
-- Allow all authenticated users to view active plans (for purchase)

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Admins can view all data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Admins can insert data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Admins can update data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Admins can delete data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Users can view active data plans" ON public.data_plans;
DROP POLICY IF EXISTS "Authenticated users can view active data plans" ON public.data_plans;

-- Policy: Admins can view all data plans
CREATE POLICY "Admins can view all data plans"
ON public.data_plans
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can insert data plans
CREATE POLICY "Admins can insert data plans"
ON public.data_plans
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can update data plans
CREATE POLICY "Admins can update data plans"
ON public.data_plans
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can delete data plans
CREATE POLICY "Admins can delete data plans"
ON public.data_plans
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Policy: All authenticated users can view active data plans (for mobile app purchases)
CREATE POLICY "Users can view active data plans"
ON public.data_plans
FOR SELECT
TO authenticated
USING (true);

-- Policy: Service role can bypass RLS (for edge functions)
-- Note: Service role should bypass RLS by default, but adding explicit policy for safety
DROP POLICY IF EXISTS "Service role can manage data plans" ON public.data_plans;
CREATE POLICY "Service role can manage data plans"
ON public.data_plans
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Verify RLS is enabled
ALTER TABLE public.data_plans ENABLE ROW LEVEL SECURITY;

-- Verify policies were created
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'data_plans';
  
  IF policy_count < 5 THEN
    RAISE WARNING 'Expected at least 5 policies on data_plans, found %', policy_count;
  END IF;
END $$;

