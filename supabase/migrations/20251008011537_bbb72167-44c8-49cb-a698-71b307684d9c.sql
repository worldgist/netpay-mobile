-- Create education_services table
CREATE TABLE public.education_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_type TEXT NOT NULL,
  service_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  api_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.education_services ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can view all education services"
ON public.education_services
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert education services"
ON public.education_services
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update education services"
ON public.education_services
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete education services"
ON public.education_services
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_education_services_updated_at
BEFORE UPDATE ON public.education_services
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();