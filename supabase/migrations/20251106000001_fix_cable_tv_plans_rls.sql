-- Fix RLS policies for cable_tv_plans table
-- Allow authenticated users to view active plans (for purchase)
-- Admins can still manage all plans

-- Add policy for authenticated users to view active plans
DROP POLICY IF EXISTS "Authenticated users can view active cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Authenticated users can view active cable tv plans"
ON public.cable_tv_plans
FOR SELECT
TO authenticated
USING (is_active = true);

-- Ensure admin policies exist (they should already exist, but make sure)
DROP POLICY IF EXISTS "Admins can view all cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Admins can view all cable tv plans"
ON public.cable_tv_plans
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Admins can insert cable tv plans"
ON public.cable_tv_plans
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Admins can update cable tv plans"
ON public.cable_tv_plans
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete cable tv plans" ON public.cable_tv_plans;
CREATE POLICY "Admins can delete cable tv plans"
ON public.cable_tv_plans
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

