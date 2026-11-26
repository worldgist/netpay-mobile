-- Create airtime_providers table
CREATE TABLE public.airtime_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network_name TEXT NOT NULL,
  min_amount DECIMAL(10,2) NOT NULL,
  max_amount DECIMAL(10,2) NOT NULL,
  commission DECIMAL(5,2),
  api_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.airtime_providers ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can view all airtime providers"
ON public.airtime_providers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert airtime providers"
ON public.airtime_providers
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update airtime providers"
ON public.airtime_providers
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete airtime providers"
ON public.airtime_providers
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_airtime_providers_updated_at
BEFORE UPDATE ON public.airtime_providers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();