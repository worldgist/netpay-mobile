-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Enable realtime for notification_recipients table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_recipients;