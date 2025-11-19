-- Allow authenticated users to read active education services (for pricing)
CREATE POLICY "Users can view active education services"
ON public.education_services
FOR SELECT
TO authenticated
USING (is_active = true);



