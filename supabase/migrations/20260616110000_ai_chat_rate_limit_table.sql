-- Global AI chat rate limit store and atomic enforcement function.
CREATE TABLE IF NOT EXISTS public.ai_chat_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_rate_limits_updated_at
  ON public.ai_chat_rate_limits(updated_at);

ALTER TABLE public.ai_chat_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enforce_ai_chat_rate_limit(
  p_user_id uuid,
  p_window_seconds integer,
  p_max_requests integer
)
RETURNS TABLE (
  allowed boolean,
  retry_after_seconds integer,
  request_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF p_window_seconds <= 0 OR p_max_requests <= 0 THEN
    RAISE EXCEPTION 'p_window_seconds and p_max_requests must be greater than 0';
  END IF;

  RETURN QUERY
  WITH upserted AS (
    INSERT INTO public.ai_chat_rate_limits AS rl (user_id, window_started_at, request_count, created_at, updated_at)
    VALUES (p_user_id, v_now, 1, v_now, v_now)
    ON CONFLICT (user_id)
    DO UPDATE SET
      request_count = CASE
        WHEN extract(epoch FROM (v_now - rl.window_started_at)) >= p_window_seconds THEN 1
        ELSE rl.request_count + 1
      END,
      window_started_at = CASE
        WHEN extract(epoch FROM (v_now - rl.window_started_at)) >= p_window_seconds THEN v_now
        ELSE rl.window_started_at
      END,
      updated_at = v_now
    RETURNING rl.window_started_at, rl.request_count
  )
  SELECT
    upserted.request_count <= p_max_requests AS allowed,
    CASE
      WHEN upserted.request_count <= p_max_requests THEN 0
      ELSE GREATEST(
        1,
        CEIL(p_window_seconds - extract(epoch FROM (v_now - upserted.window_started_at)))::integer
      )
    END AS retry_after_seconds,
    upserted.request_count
  FROM upserted;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_ai_chat_rate_limit(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_ai_chat_rate_limit(uuid, integer, integer) TO service_role;
