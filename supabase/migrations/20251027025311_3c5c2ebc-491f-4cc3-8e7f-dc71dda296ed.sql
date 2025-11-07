-- Create MTN Awuf pricing tiers table
CREATE TABLE public.mtn_awuf_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier_name TEXT NOT NULL,
  min_amount NUMERIC NOT NULL,
  max_amount NUMERIC NOT NULL,
  bonus_percentage NUMERIC NOT NULL,
  commission NUMERIC DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.mtn_awuf_tiers ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can view all MTN Awuf tiers" 
ON public.mtn_awuf_tiers 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert MTN Awuf tiers" 
ON public.mtn_awuf_tiers 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update MTN Awuf tiers" 
ON public.mtn_awuf_tiers 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete MTN Awuf tiers" 
ON public.mtn_awuf_tiers 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create policy for authenticated users to view active tiers
CREATE POLICY "Users can view active MTN Awuf tiers" 
ON public.mtn_awuf_tiers 
FOR SELECT 
USING (is_active = true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_mtn_awuf_tiers_updated_at
BEFORE UPDATE ON public.mtn_awuf_tiers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default MTN Awuf tiers
INSERT INTO public.mtn_awuf_tiers (tier_name, min_amount, max_amount, bonus_percentage, commission) VALUES
('Standard Tier', 1, 99, 275, 0),
('Premium Tier', 100, 999999, 400, 0);