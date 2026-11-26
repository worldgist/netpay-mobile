-- Fraud / risk detection: signals, review cases, and purchase velocity limits.

CREATE TABLE IF NOT EXISTS public.fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('allow', 'hold', 'block')),
  score INTEGER NOT NULL DEFAULT 0,
  reasons TEXT[] NOT NULL DEFAULT '{}',
  amount NUMERIC(18, 2),
  reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_created_at
  ON public.fraud_signals (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_user_created_at
  ON public.fraud_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_action_created_at
  ON public.fraud_signals (action, created_at DESC)
  WHERE action IN ('hold', 'block');

CREATE TABLE IF NOT EXISTS public.fraud_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES public.fraud_signals(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'approved', 'rejected', 'dismissed')),
  amount NUMERIC(18, 2),
  reference TEXT,
  reasons TEXT[] NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  resolution_note TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_cases_status_created_at
  ON public.fraud_cases (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_cases_user_status
  ON public.fraud_cases (user_id, status);

ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read fraud_signals" ON public.fraud_signals;
CREATE POLICY "Admins can read fraud_signals"
  ON public.fraud_signals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage fraud_cases" ON public.fraud_cases;
CREATE POLICY "Admins can manage fraud_cases"
  ON public.fraud_cases FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Purchase / wallet-spend risk limits (mirrors transfer_risk_limits shape).
INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'purchase_risk_limits',
  '{
    "max_single_txn": 200000,
    "daily_outflow_cap": 1000000,
    "hourly_txn_count_cap": 30,
    "new_account_days": 7,
    "new_account_daily_outflow_cap": 100000,
    "hold_score_threshold": 70,
    "block_score_threshold": 100
  }'::jsonb,
  'limits',
  'Bill purchase risk controls: max per txn, daily spend, hourly count, new-account cap, hold/block score thresholds.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Extend transfer limits with hold/block thresholds when missing.
UPDATE public.app_settings
SET setting_value = setting_value
  || '{"hold_score_threshold": 70, "block_score_threshold": 100}'::jsonb,
  updated_at = now()
WHERE setting_key = 'transfer_risk_limits'
  AND NOT (setting_value ? 'hold_score_threshold');

COMMENT ON TABLE public.fraud_signals IS
  'Risk engine audit trail for allow/hold/block decisions on transfers and purchases.';

COMMENT ON TABLE public.fraud_cases IS
  'Manual review queue for held/blocked high-risk transactions.';
