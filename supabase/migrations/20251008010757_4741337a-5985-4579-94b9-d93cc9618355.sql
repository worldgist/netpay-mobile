-- Create electricity_plans table
CREATE TABLE public.electricity_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  package_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  api_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.electricity_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can view all electricity plans"
ON public.electricity_plans
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert electricity plans"
ON public.electricity_plans
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update electricity plans"
ON public.electricity_plans
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete electricity plans"
ON public.electricity_plans
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_electricity_plans_updated_at
BEFORE UPDATE ON public.electricity_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create cable_tv_plans table
CREATE TABLE public.cable_tv_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  package_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  api_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.cable_tv_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can view all cable tv plans"
ON public.cable_tv_plans
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert cable tv plans"
ON public.cable_tv_plans
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update cable tv plans"
ON public.cable_tv_plans
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete cable tv plans"
ON public.cable_tv_plans
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_cable_tv_plans_updated_at
BEFORE UPDATE ON public.cable_tv_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();