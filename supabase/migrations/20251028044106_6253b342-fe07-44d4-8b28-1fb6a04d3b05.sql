-- Create app_settings table for general application configuration
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}',
  setting_category TEXT NOT NULL CHECK (setting_category IN ('commissions', 'limits', 'system', 'notifications')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for app_settings
CREATE POLICY "Admins can view app settings"
ON public.app_settings FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update app settings"
ON public.app_settings FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert app settings"
ON public.app_settings FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete app settings"
ON public.app_settings FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description) VALUES
  ('airtime_commission', '{"percentage": 2.0}', 'commissions', 'Commission percentage for airtime purchases'),
  ('data_commission', '{"percentage": 3.0}', 'commissions', 'Commission percentage for data purchases'),
  ('cable_tv_commission', '{"percentage": 2.5}', 'commissions', 'Commission percentage for cable TV subscriptions'),
  ('electricity_commission', '{"percentage": 1.5}', 'commissions', 'Commission percentage for electricity payments'),
  ('education_commission', '{"percentage": 2.0}', 'commissions', 'Commission percentage for education services'),
  
  ('min_airtime_amount', '{"amount": 50}', 'limits', 'Minimum airtime purchase amount'),
  ('max_airtime_amount', '{"amount": 50000}', 'limits', 'Maximum airtime purchase amount'),
  ('min_data_amount', '{"amount": 100}', 'limits', 'Minimum data purchase amount'),
  ('max_data_amount', '{"amount": 100000}', 'limits', 'Maximum data purchase amount'),
  ('min_funding_amount', '{"amount": 100}', 'limits', 'Minimum wallet funding amount'),
  ('max_funding_amount', '{"amount": 1000000}', 'limits', 'Maximum wallet funding amount'),
  
  ('maintenance_mode', '{"enabled": false}', 'system', 'Enable or disable maintenance mode'),
  ('auto_confirm_transactions', '{"enabled": true}', 'system', 'Automatically confirm successful transactions'),
  ('allow_user_registration', '{"enabled": true}', 'system', 'Allow new users to register'),
  
  ('email_notifications', '{"enabled": true}', 'notifications', 'Send email notifications to users'),
  ('sms_notifications', '{"enabled": false}', 'notifications', 'Send SMS notifications to users'),
  ('transaction_alerts', '{"enabled": true}', 'notifications', 'Send alerts for transactions');