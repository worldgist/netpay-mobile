-- Add biometric_enabled column to profiles table
ALTER TABLE public.profiles
ADD COLUMN biometric_enabled boolean DEFAULT false NOT NULL;