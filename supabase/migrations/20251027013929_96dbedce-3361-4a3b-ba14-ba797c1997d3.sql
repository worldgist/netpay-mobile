-- Allow authenticated users to view data plans
CREATE POLICY "Users can view active data plans"
  ON public.data_plans
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to view airtime providers
CREATE POLICY "Users can view active airtime providers"
  ON public.airtime_providers
  FOR SELECT
  TO authenticated
  USING (is_active = true);