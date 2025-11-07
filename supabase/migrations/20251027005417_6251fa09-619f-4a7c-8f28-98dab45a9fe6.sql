-- Add PIN field to profiles table
ALTER TABLE public.profiles
ADD COLUMN pin_hash TEXT,
ADD COLUMN pin_enabled BOOLEAN DEFAULT false;

-- Create function to verify PIN
CREATE OR REPLACE FUNCTION public.verify_user_pin(user_email TEXT, user_pin TEXT)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_uuid uuid;
  stored_pin TEXT;
BEGIN
  -- Get user ID and PIN hash by email
  SELECT p.id, p.pin_hash INTO user_uuid, stored_pin
  FROM public.profiles p
  WHERE p.email = user_email
    AND p.pin_enabled = true;
  
  -- Check if user exists and PIN matches
  IF user_uuid IS NOT NULL AND stored_pin = crypt(user_pin, stored_pin) THEN
    RETURN user_uuid;
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;