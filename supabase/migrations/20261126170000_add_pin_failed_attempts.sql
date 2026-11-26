-- Track consecutive wrong PIN login attempts for lockout / suspension.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.pin_failed_attempts IS
  'Consecutive failed PIN login attempts. Reset on successful PIN login. Account is suspended at 5.';
