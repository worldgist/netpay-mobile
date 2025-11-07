-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('all', 'single', 'multiple')),
  recipient_ids UUID[] DEFAULT '{}',
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create policies for notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  recipient_type = 'all' OR 
  auth.uid() = ANY(recipient_ids)
);

CREATE POLICY "Admins can view all notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create notification recipients table for tracking read status
CREATE TABLE public.notification_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

-- Create policies for notification recipients
CREATE POLICY "Users can view their own notification status"
ON public.notification_recipients
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all notification statuses"
ON public.notification_recipients
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their notification status"
ON public.notification_recipients
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "System can insert notification recipients"
ON public.notification_recipients
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_recipient_ids ON public.notifications USING GIN(recipient_ids);
CREATE INDEX idx_notification_recipients_user_id ON public.notification_recipients(user_id);
CREATE INDEX idx_notification_recipients_notification_id ON public.notification_recipients(notification_id);