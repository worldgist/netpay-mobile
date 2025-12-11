-- Add service_role policy for data_plans table
-- This allows edge functions (using service_role) to bypass RLS

DROP POLICY IF EXISTS "Service role can manage data plans" ON public.data_plans;

CREATE POLICY "Service role can manage data plans"
ON public.data_plans
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


