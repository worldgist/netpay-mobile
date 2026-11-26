-- Create email_logs table for tracking admin emails sent to users
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  subject TEXT NOT NULL,
  recipient_emails TEXT[] NOT NULL DEFAULT '{}',
  user_ids UUID[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  resend_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_by ON public.email_logs(sent_by);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);

-- Enable Row Level Security
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_logs
-- Admins can view all email logs
CREATE POLICY "Admins can view all email logs"
ON public.email_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can insert email logs (via service role in edge function)
CREATE POLICY "Admins can insert email logs"
ON public.email_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role can manage email logs"
ON public.email_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);





