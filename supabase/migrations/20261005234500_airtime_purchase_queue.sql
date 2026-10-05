-- Durable airtime queue and idempotency. Wallet debits stay on append_user_ledger_entry.

ALTER TABLE public.airtime_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS airtime_transactions_user_idempotency_key
  ON public.airtime_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS airtime_transactions_provider_reference
  ON public.airtime_transactions (provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.airtime_purchase_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.airtime_transactions(id),
  user_id uuid NOT NULL,
  reference text NOT NULL UNIQUE,
  idempotency_key text NOT NULL,
  provider text NOT NULL,
  phone_number text NOT NULL,
  network text NOT NULL,
  service_id text NOT NULL,
  amount numeric NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 4,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  provider_reference text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT airtime_purchase_jobs_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'review'))
);

CREATE UNIQUE INDEX IF NOT EXISTS airtime_purchase_jobs_user_idempotency
  ON public.airtime_purchase_jobs (user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS airtime_purchase_jobs_claim
  ON public.airtime_purchase_jobs (status, next_attempt_at, created_at);

ALTER TABLE public.airtime_purchase_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own airtime jobs" ON public.airtime_purchase_jobs;
CREATE POLICY "Users can view their own airtime jobs"
  ON public.airtime_purchase_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.claim_airtime_purchase_jobs(
  p_limit integer,
  p_max_running integer,
  p_stale_seconds integer DEFAULT 180
)
RETURNS SETOF public.airtime_purchase_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_running integer;
  v_take integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('netpay_airtime_purchase_claim'));

  UPDATE public.airtime_purchase_jobs
  SET
    status = CASE WHEN retry_count >= max_retries THEN 'review' ELSE 'queued' END,
    locked_at = NULL,
    next_attempt_at = CASE
      WHEN retry_count >= max_retries THEN next_attempt_at
      ELSE now()
    END,
    updated_at = now(),
    last_error = COALESCE(last_error, 'worker_stale')
  WHERE status = 'running'
    AND locked_at IS NOT NULL
    AND locked_at < now() - make_interval(secs => GREATEST(p_stale_seconds, 30));

  UPDATE public.airtime_transactions AS txn
  SET status = 'requires_review', updated_at = now()
  WHERE txn.status = 'processing'
    AND EXISTS (
      SELECT 1
      FROM public.airtime_purchase_jobs job
      WHERE job.transaction_id = txn.id
        AND job.status = 'review'
    );

  SELECT count(*) INTO v_running
  FROM public.airtime_purchase_jobs
  WHERE status = 'running';

  v_take := LEAST(GREATEST(p_limit, 0), GREATEST(p_max_running - v_running, 0));
  IF v_take <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.airtime_purchase_jobs
    WHERE status = 'queued'
      AND next_attempt_at <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT v_take
  ),
  claimed AS (
    UPDATE public.airtime_purchase_jobs job
    SET status = 'running', locked_at = now(), updated_at = now()
    FROM picked
    WHERE job.id = picked.id
    RETURNING job.*
  )
  SELECT * FROM claimed;

  UPDATE public.airtime_transactions txn
  SET status = 'processing', updated_at = now()
  WHERE txn.status IN ('pending', 'processing')
    AND txn.id IN (
      SELECT transaction_id
      FROM public.airtime_purchase_jobs
      WHERE status = 'running'
        AND locked_at > now() - interval '5 seconds'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_airtime_purchase_jobs(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_airtime_purchase_jobs(integer, integer, integer) TO service_role;
