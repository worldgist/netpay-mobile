CREATE TABLE IF NOT EXISTS public.admin_task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_key)
);

CREATE INDEX IF NOT EXISTS admin_task_assignments_user_id_idx
  ON public.admin_task_assignments (user_id);

ALTER TABLE public.admin_task_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view admin task assignments" ON public.admin_task_assignments;
CREATE POLICY "Admins can view admin task assignments"
ON public.admin_task_assignments
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
