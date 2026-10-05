-- Durable queue for data, cable, electricity, education, and betting.
-- Wallet debits stay inside the existing purchase functions.

CREATE TABLE IF NOT EXISTS public.purchase_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  service text NOT NULL,
  target_function text NOT NULL,
  service_table text,
  transaction_id uuid,
  reference text NOT NULL UNIQUE,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  amount numeric NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 4,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_jobs_service_check
    CHECK (service IN ('data', 'cable', 'electricity', 'education', 'betting')),
  CONSTRAINT purchase_jobs_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'review'))
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_jobs_user_idempotency
  ON public.purchase_jobs (user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS purchase_jobs_claim
  ON public.purchase_jobs (status, next_attempt_at, created_at);

ALTER TABLE public.purchase_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own purchase jobs" ON public.purchase_jobs;
CREATE POLICY "Users can view their own purchase jobs"
  ON public.purchase_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- When a provider function inserts the finished row, replace the processing placeholder
-- that shares the same user and reference. A failed insert rolls this delete back.
CREATE OR REPLACE FUNCTION public.replace_same_reference_purchase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference IS NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format(
    'DELETE FROM public.%I WHERE user_id = $1 AND reference = $2 AND id IS DISTINCT FROM $3',
    TG_TABLE_NAME
  ) USING NEW.user_id, NEW.reference, NEW.id;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'data_transactions',
    'cable_tv_transactions',
    'electricity_transactions',
    'education_transactions',
    'betting_transactions'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS replace_same_reference_purchase ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER replace_same_reference_purchase BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.replace_same_reference_purchase()',
      table_name
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (user_id, reference)',
      table_name || '_user_reference_idx',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_purchase_jobs(
  p_limit integer,
  p_max_running integer,
  p_stale_seconds integer DEFAULT 180
)
RETURNS SETOF public.purchase_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_running integer;
  v_take integer;
  stale record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('netpay_purchase_claim'));

  -- A stale bill job is not run again. The provider call may already have started.
  FOR stale IN
    SELECT id, service_table, transaction_id
    FROM public.purchase_jobs
    WHERE status = 'running'
      AND locked_at IS NOT NULL
      AND locked_at < now() - make_interval(secs => GREATEST(p_stale_seconds, 30))
    FOR UPDATE
  LOOP
    UPDATE public.purchase_jobs
    SET
      status = 'review',
      locked_at = NULL,
      updated_at = now(),
      last_error = COALESCE(last_error, 'worker_stale')
    WHERE id = stale.id;

    IF stale.transaction_id IS NOT NULL AND stale.service_table IN (
      'data_transactions',
      'cable_tv_transactions',
      'electricity_transactions',
      'education_transactions',
      'betting_transactions'
    ) THEN
      BEGIN
        EXECUTE format(
          'UPDATE public.%I SET status = %L WHERE id = $1 AND status IN (%L, %L)',
          stale.service_table,
          'requires_review',
          'pending',
          'processing'
        ) USING stale.transaction_id;
      EXCEPTION
        WHEN undefined_table OR undefined_column THEN
          NULL;
      END;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_running
  FROM public.purchase_jobs
  WHERE status = 'running';

  v_take := LEAST(GREATEST(p_limit, 0), GREATEST(p_max_running - v_running, 0));
  IF v_take <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.purchase_jobs
    WHERE status = 'queued'
      AND next_attempt_at <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT v_take
  ),
  claimed AS (
    UPDATE public.purchase_jobs job
    SET status = 'running', locked_at = now(), updated_at = now()
    FROM picked
    WHERE job.id = picked.id
    RETURNING job.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_purchase_jobs(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_purchase_jobs(integer, integer, integer) TO service_role;
