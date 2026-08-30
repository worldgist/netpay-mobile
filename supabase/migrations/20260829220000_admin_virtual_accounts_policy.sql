-- Allow admins to view all virtual accounts (for admin Virtual Accounts page)
CREATE POLICY "Admins can view all virtual accounts"
ON public.virtual_accounts
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));
