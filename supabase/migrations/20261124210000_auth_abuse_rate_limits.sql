-- Auth abuse rate limits for PIN login and password-reset code sending.
CREATE TABLE IF NOT EXISTS public.auth_abuse_rate_limits (
  bucket text NOT NULL,
  rate_key text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  lockout_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, rate_key)
);

CREATE INDEX IF NOT EXISTS idx_auth_abuse_rate_limits_updated_at
  ON public.auth_abuse_rate_limits (updated_at);

CREATE INDEX IF NOT EXISTS idx_auth_abuse_rate_limits_lockout
  ON public.auth_abuse_rate_limits (lockout_until)
  WHERE lockout_until IS NOT NULL;

ALTER TABLE public.auth_abuse_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enforce_auth_abuse_rate_limit(
  p_bucket text,
  p_rate_key text,
  p_window_seconds integer,
  p_max_requests integer,
  p_lockout_seconds integer DEFAULT 0
)
RETURNS TABLE (
  allowed boolean,
  retry_after_seconds integer,
  request_count integer,
  locked_out boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.auth_abuse_rate_limits%ROWTYPE;
  v_count integer;
  v_window_started timestamptz;
  v_lockout timestamptz;
  v_retry integer := 0;
BEGIN
  IF p_bucket IS NULL OR length(trim(p_bucket)) = 0 THEN
    RAISE EXCEPTION 'p_bucket is required';
  END IF;
  IF p_rate_key IS NULL OR length(trim(p_rate_key)) = 0 THEN
    RAISE EXCEPTION 'p_rate_key is required';
  END IF;
  IF p_window_seconds <= 0 OR p_max_requests <= 0 THEN
    RAISE EXCEPTION 'p_window_seconds and p_max_requests must be greater than 0';
  END IF;

  SELECT * INTO v_row
  FROM public.auth_abuse_rate_limits
  WHERE bucket = p_bucket AND rate_key = p_rate_key
  FOR UPDATE;

  IF FOUND AND v_row.lockout_until IS NOT NULL AND v_row.lockout_until > v_now THEN
    v_retry := GREATEST(1, CEIL(extract(epoch FROM (v_row.lockout_until - v_now)))::integer);
    RETURN QUERY SELECT false, v_retry, v_row.request_count, true;
    RETURN;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.auth_abuse_rate_limits AS rl
      (bucket, rate_key, window_started_at, request_count, lockout_until, created_at, updated_at)
    VALUES (p_bucket, p_rate_key, v_now, 1, NULL, v_now, v_now)
    RETURNING * INTO v_row;
  ELSE
    IF extract(epoch FROM (v_now - v_row.window_started_at)) >= p_window_seconds THEN
      v_count := 1;
      v_window_started := v_now;
      v_lockout := NULL;
    ELSE
      v_count := v_row.request_count + 1;
      v_window_started := v_row.window_started_at;
      v_lockout := v_row.lockout_until;
    END IF;

    IF p_lockout_seconds > 0 AND v_count > p_max_requests THEN
      v_lockout := v_now + make_interval(secs => p_lockout_seconds);
    END IF;

    UPDATE public.auth_abuse_rate_limits
    SET
      request_count = v_count,
      window_started_at = v_window_started,
      lockout_until = v_lockout,
      updated_at = v_now
    WHERE bucket = p_bucket AND rate_key = p_rate_key
    RETURNING * INTO v_row;
  END IF;

  IF v_row.request_count > p_max_requests THEN
    IF v_row.lockout_until IS NOT NULL AND v_row.lockout_until > v_now THEN
      v_retry := GREATEST(1, CEIL(extract(epoch FROM (v_row.lockout_until - v_now)))::integer);
    ELSE
      v_retry := GREATEST(
        1,
        CEIL(p_window_seconds - extract(epoch FROM (v_now - v_row.window_started_at)))::integer
      );
    END IF;
    RETURN QUERY SELECT false, v_retry, v_row.request_count, (v_row.lockout_until IS NOT NULL AND v_row.lockout_until > v_now);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 0, v_row.request_count, false;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_auth_abuse_rate_limit(text, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_auth_abuse_rate_limit(text, text, integer, integer, integer) TO service_role;

-- Flight bookings: users may only create pending bookings priced from the flights table.
DROP POLICY IF EXISTS "Users can create own flight bookings" ON public.flight_bookings;
CREATE POLICY "Users can create own flight bookings"
ON public.flight_bookings
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND (
    flight_id IS NULL
    OR ticket_price = (SELECT f.ticket_price FROM public.flights f WHERE f.id = flight_id)
  )
);
