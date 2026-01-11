-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON public.password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON public.password_reset_tokens(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON public.password_reset_tokens(expires_at);

-- Enable RLS
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own reset tokens
CREATE POLICY "Users can view their own reset tokens"
ON public.password_reset_tokens
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: System can insert reset tokens
CREATE POLICY "System can insert reset tokens"
ON public.password_reset_tokens
FOR INSERT
WITH CHECK (true);

-- Policy: System can update reset tokens
CREATE POLICY "System can update reset tokens"
ON public.password_reset_tokens
FOR UPDATE
USING (true);

-- Policy: Admins can view all reset tokens
CREATE POLICY "Admins can view all reset tokens"
ON public.password_reset_tokens
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Function to clean up expired tokens (optional, can be run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_password_reset_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM public.password_reset_tokens
  WHERE expires_at < now() OR used = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.password_reset_tokens IS 'Stores password reset token codes sent to users';
COMMENT ON COLUMN public.password_reset_tokens.token IS '6-digit token code';
COMMENT ON COLUMN public.password_reset_tokens.expires_at IS 'Token expiration time (15 minutes from creation)';
COMMENT ON COLUMN public.password_reset_tokens.used IS 'Whether the token has been used';














