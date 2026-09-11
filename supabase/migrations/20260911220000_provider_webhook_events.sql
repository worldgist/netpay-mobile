-- Idempotent webhook processing: one row per provider event ID.

CREATE TABLE IF NOT EXISTS public.provider_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT provider_webhook_events_provider_event_id_unique UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_webhook_events_provider_created
  ON public.provider_webhook_events (provider, created_at DESC);

ALTER TABLE public.provider_webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.provider_webhook_events IS
  'Dedupes payment provider webhooks by stable event id; service role only.';
