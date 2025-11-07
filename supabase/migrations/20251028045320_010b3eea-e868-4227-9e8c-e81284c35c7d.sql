-- Create staff_roles table
CREATE TABLE public.staff_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL UNIQUE,
  role_description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  can_manage_users BOOLEAN NOT NULL DEFAULT false,
  can_manage_transactions BOOLEAN NOT NULL DEFAULT false,
  can_manage_content BOOLEAN NOT NULL DEFAULT false,
  can_view_analytics BOOLEAN NOT NULL DEFAULT false,
  can_manage_staff BOOLEAN NOT NULL DEFAULT false,
  can_manage_settings BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff_duties table
CREATE TABLE public.staff_duties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
  duty_title TEXT NOT NULL,
  duty_description TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff_members table
CREATE TABLE public.staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.staff_roles(id),
  employee_id TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  hire_date DATE NOT NULL,
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'suspended', 'terminated', 'on_leave')),
  supervisor_id UUID REFERENCES public.staff_members(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff_activity_logs table
CREATE TABLE public.staff_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_description TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_staff_members_user_id ON public.staff_members(user_id);
CREATE INDEX idx_staff_members_role_id ON public.staff_members(role_id);
CREATE INDEX idx_staff_members_status ON public.staff_members(employment_status);
CREATE INDEX idx_staff_duties_role_id ON public.staff_duties(role_id);
CREATE INDEX idx_staff_activity_staff_id ON public.staff_activity_logs(staff_id);
CREATE INDEX idx_staff_activity_created_at ON public.staff_activity_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for staff_roles
CREATE POLICY "Admins can manage staff roles"
ON public.staff_roles FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view roles"
ON public.staff_roles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = auth.uid() AND employment_status = 'active'
  )
);

-- RLS Policies for staff_duties
CREATE POLICY "Admins can manage staff duties"
ON public.staff_duties FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view duties"
ON public.staff_duties FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = auth.uid() AND employment_status = 'active'
  )
);

-- RLS Policies for staff_members
CREATE POLICY "Admins can manage all staff"
ON public.staff_members FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view their own record"
ON public.staff_members FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Supervisors can view their team"
ON public.staff_members FOR SELECT
USING (
  supervisor_id = (
    SELECT id FROM public.staff_members WHERE user_id = auth.uid()
  )
);

-- RLS Policies for staff_activity_logs
CREATE POLICY "Admins can view all activity logs"
ON public.staff_activity_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert activity logs"
ON public.staff_activity_logs FOR INSERT
WITH CHECK (true);

CREATE POLICY "Staff can view their own activity"
ON public.staff_activity_logs FOR SELECT
USING (
  staff_id = (
    SELECT id FROM public.staff_members WHERE user_id = auth.uid()
  )
);

-- Create triggers for updated_at
CREATE TRIGGER update_staff_roles_updated_at
BEFORE UPDATE ON public.staff_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_duties_updated_at
BEFORE UPDATE ON public.staff_duties
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_members_updated_at
BEFORE UPDATE ON public.staff_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default staff roles
INSERT INTO public.staff_roles (role_name, role_description, permissions, can_manage_users, can_manage_transactions, can_manage_content, can_view_analytics, can_manage_staff, can_manage_settings) VALUES
  ('Manager', 'Full management access with ability to oversee all operations', '{"level": "high", "access": "full"}', true, true, true, true, true, false),
  ('Customer Support', 'Handle customer inquiries and support tickets', '{"level": "medium", "access": "support"}', true, false, false, false, false, false),
  ('Accountant', 'Manage financial transactions and reports', '{"level": "high", "access": "financial"}', false, true, false, true, false, false),
  ('Content Manager', 'Manage website content and communications', '{"level": "medium", "access": "content"}', false, false, true, false, false, false),
  ('Operations Officer', 'Handle day-to-day operations and service delivery', '{"level": "medium", "access": "operations"}', false, true, false, false, false, false);

-- Insert default duties for each role
INSERT INTO public.staff_duties (role_id, duty_title, duty_description, priority, is_mandatory)
SELECT 
  sr.id,
  d.title,
  d.description,
  d.priority,
  d.mandatory
FROM public.staff_roles sr
CROSS JOIN LATERAL (
  VALUES
    -- Manager duties
    ('Oversee Team Performance', 'Monitor and evaluate staff performance, provide feedback and coaching', 'high'::text, true),
    ('Strategic Planning', 'Develop and implement strategic plans for business growth', 'high'::text, true),
    ('Budget Management', 'Manage departmental budget and approve expenditures', 'high'::text, true),
    ('Staff Development', 'Conduct training sessions and development programs', 'medium'::text, true),
    ('Report Generation', 'Generate and analyze monthly performance reports', 'medium'::text, true)
) AS d(title, description, priority, mandatory)
WHERE sr.role_name = 'Manager'

UNION ALL

SELECT 
  sr.id,
  d.title,
  d.description,
  d.priority,
  d.mandatory
FROM public.staff_roles sr
CROSS JOIN LATERAL (
  VALUES
    -- Customer Support duties
    ('Respond to Inquiries', 'Answer customer questions via email, phone, and chat', 'high'::text, true),
    ('Resolve Complaints', 'Handle and resolve customer complaints professionally', 'high'::text, true),
    ('Update Customer Records', 'Maintain accurate customer information and interaction history', 'medium'::text, true),
    ('Escalate Issues', 'Escalate complex issues to appropriate departments', 'high'::text, true),
    ('Follow Up', 'Follow up with customers to ensure satisfaction', 'medium'::text, false)
) AS d(title, description, priority, mandatory)
WHERE sr.role_name = 'Customer Support'

UNION ALL

SELECT 
  sr.id,
  d.title,
  d.description,
  d.priority,
  d.mandatory
FROM public.staff_roles sr
CROSS JOIN LATERAL (
  VALUES
    -- Accountant duties
    ('Process Transactions', 'Review and process financial transactions daily', 'high'::text, true),
    ('Reconcile Accounts', 'Perform daily account reconciliation', 'high'::text, true),
    ('Generate Financial Reports', 'Prepare monthly and quarterly financial reports', 'high'::text, true),
    ('Tax Compliance', 'Ensure tax compliance and timely filing', 'high'::text, true),
    ('Audit Support', 'Support internal and external audits', 'medium'::text, true)
) AS d(title, description, priority, mandatory)
WHERE sr.role_name = 'Accountant'

UNION ALL

SELECT 
  sr.id,
  d.title,
  d.description,
  d.priority,
  d.mandatory
FROM public.staff_roles sr
CROSS JOIN LATERAL (
  VALUES
    -- Content Manager duties
    ('Create Content', 'Write and edit content for website and marketing materials', 'high'::text, true),
    ('Update Website', 'Keep website content current and accurate', 'high'::text, true),
    ('Social Media Management', 'Manage social media accounts and engagement', 'medium'::text, true),
    ('SEO Optimization', 'Optimize content for search engines', 'medium'::text, false),
    ('Content Calendar', 'Maintain content calendar and publishing schedule', 'medium'::text, true)
) AS d(title, description, priority, mandatory)
WHERE sr.role_name = 'Content Manager'

UNION ALL

SELECT 
  sr.id,
  d.title,
  d.description,
  d.priority,
  d.mandatory
FROM public.staff_roles sr
CROSS JOIN LATERAL (
  VALUES
    -- Operations Officer duties
    ('Service Delivery', 'Ensure timely delivery of services to customers', 'high'::text, true),
    ('Quality Control', 'Monitor service quality and implement improvements', 'high'::text, true),
    ('Vendor Management', 'Coordinate with service providers and vendors', 'medium'::text, true),
    ('System Monitoring', 'Monitor system performance and uptime', 'high'::text, true),
    ('Process Documentation', 'Document operational processes and procedures', 'medium'::text, false)
) AS d(title, description, priority, mandatory)
WHERE sr.role_name = 'Operations Officer';

-- Enable realtime for staff tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_activity_logs;